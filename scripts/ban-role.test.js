const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Collection, MessageFlags, PermissionFlagsBits } = require('discord.js');
const records = require('../services/moderationRecords');
const permissions = require('../services/permissions');

const makeMember = (id, { position = 1, hasRole = true, bannable = true, canBan = true } = {}) => ({
    id,
    bannable,
    permissions: { has: permission => permission === PermissionFlagsBits.BanMembers && canBan },
    roles: {
        cache: new Collection(hasRole ? [['role', {}]] : []),
        highest: { position, comparePositionTo(other) { return this.position - other.position; } },
    },
});

const createHarness = (t, options = {}) => {
    const members = options.members || [makeMember('target')];
    const moderator = makeMember('moderator', { position: 10, canBan: options.moderatorCanBan !== false });
    const bot = makeMember('bot', { position: 20, canBan: options.botCanBan !== false });
    const savedRecords = [];
    const bans = [];
    const banAttempts = [];
    const edits = [];
    const replies = [];
    const listCalls = [];
    const fetchCalls = [];
    let filter;

    t.mock.method(console, 'error', () => {});
    t.mock.method(records, 'recordModerationAction', async (record) => {
        savedRecords.push(record);
        if (options.logFailure) throw new Error('Database unavailable');
    });
    t.mock.method(permissions, 'isCommandAllowed', async () => options.allowed !== false);
    delete require.cache[require.resolve('../commands/moderation/ban_role')];
    const command = require('../commands/moderation/ban_role');

    const confirmation = {
        customId: `ban-role:${options.choice || 'confirm'}:interaction`,
        update: async (payload) => {
            edits.push(payload);
            if (options.onConfirm) options.onConfirm({ members, moderator, bot });
        },
        editReply: async (payload) => { edits.push(payload); },
    };
    const message = {
        awaitMessageComponent: async (collectorOptions) => {
            assert.equal(bans.length, 0, 'Bans must wait for confirmation');
            assert.equal(collectorOptions.time, 60_000);
            filter = collectorOptions.filter;
            if (options.onWait) await options.onWait({ command, interaction });
            if (options.timeout) throw new Error('Collector timed out');
            return confirmation;
        },
    };
    const guild = {
        id: 'guild',
        ownerId: options.ownerId || 'owner',
        roles: { fetch: async () => {} },
        members: {
            fetchMe: async () => bot,
            fetch: async (fetchOptions) => {
                assert.equal(fetchOptions.force, true);
                fetchCalls.push(fetchOptions.user);
                if (fetchOptions.user === moderator.id) return moderator;
                const failure = options.fetchFailures?.[fetchOptions.user];
                if (failure) throw failure;
                return members.find(member => member.id === fetchOptions.user);
            },
            list: async (listOptions) => {
                listCalls.push(listOptions);
                if (options.listFailureAt === listCalls.length) throw new Error('Listing failed');
                const page = options.pages ? options.pages[listCalls.length - 1] : members;
                return new Collection(page.map(member => [member.id, member]));
            },
        },
        bans: {
            create: async (id, banOptions) => {
                banAttempts.push(id);
                if (options.banFailures?.includes(id)) throw new Error('Ban rejected');
                bans.push({ id, ...banOptions });
                if (options.onBan) options.onBan({ id, moderator, bot });
            },
        },
    };
    const interaction = {
        id: 'interaction',
        guild: options.dm ? null : guild,
        guildId: guild.id,
        user: { id: moderator.id },
        client: { user: { id: bot.id } },
        options: {
            getRole: () => ({ id: options.roleId || 'role' }),
            getString: () => options.reason ?? 'Raid accounts',
        },
        reply: async (payload) => { replies.push(payload); },
        deferReply: async (payload) => { assert.equal(payload.flags, MessageFlags.Ephemeral); },
        editReply: async (payload) => { edits.push(payload); return message; },
    };
    return {
        command, interaction, bans, banAttempts, savedRecords, edits, replies, listCalls, fetchCalls,
        run: () => command.execute(interaction),
        get filter() { return filter; },
        get result() { return edits.at(-1)?.content || replies.at(-1)?.content; },
    };
};

test('command registration requires a role, reason, and Ban Members permission', (t) => {
    const { command } = createHarness(t);
    const data = command.data.toJSON();
    assert.equal(data.name, 'ban-role');
    assert.equal(data.dm_permission, false);
    assert.equal(data.default_member_permissions, PermissionFlagsBits.BanMembers.toString());
    assert.deepEqual(data.options.map(option => [option.name, option.required]), [['role', true], ['reason', true]]);
});

for (const [description, options, expected] of [
    ['direct messages', { dm: true }, /inside a server/],
    ['everyone', { roleId: 'guild' }, /@everyone/],
    ['blank reasons', { reason: '   ' }, /provide a reason/],
    ['moderators without Ban Members', { moderatorCanBan: false }, /You need the Ban Members/],
    ['bots without Ban Members', { botCanBan: false }, /I need the Ban Members/],
]) {
    test(`rejects ${description} without listing or banning members`, async (t) => {
        const harness = createHarness(t, options);
        await harness.run();
        assert.match(harness.result, expected);
        assert.equal(harness.listCalls.length, 0);
        assert.equal(harness.bans.length, 0);
    });
}

test('bans only eligible role members and records successful bans', async (t) => {
    const harness = createHarness(t, { members: [
        makeMember('eligible'),
        makeMember('other-role', { hasRole: false }),
        makeMember('moderator'),
        makeMember('bot'),
        makeMember('owner'),
        makeMember('peer', { position: 10 }),
        makeMember('higher', { position: 11 }),
        makeMember('unbannable', { bannable: false }),
    ] });
    await harness.run();
    assert.deepEqual(harness.bans.map(ban => ban.id), ['eligible']);
    assert.equal(harness.bans[0].deleteMessageSeconds, 0);
    assert.match(harness.bans[0].reason, /moderator: Raid accounts/);
    assert.deepEqual(harness.savedRecords[0], {
        guildId: 'guild', userId: 'eligible', action: 'ban', moderatorId: 'moderator', reason: 'Raid accounts',
        metadata: { command: 'ban-role', roleId: 'role' },
        stateUpdates: { isBanned: true, bannedUntil: null },
    });
    assert.match(harness.result, /Banned: 1\. Skipped: 6\. Failed: 0/);
    assert.equal(harness.filter({ user: { id: 'stranger' }, customId: 'ban-role:confirm:interaction' }), false);
    assert.equal(harness.filter({ user: { id: 'moderator' }, customId: 'different-action' }), false);
    assert.equal(harness.filter({ user: { id: 'moderator' }, customId: 'ban-role:confirm:interaction' }), true);
});

test('server owner bypasses only the moderator hierarchy', async (t) => {
    const harness = createHarness(t, { ownerId: 'moderator', members: [
        makeMember('above-owner', { position: 11 }),
        makeMember('above-bot', { position: 21, bannable: false }),
    ] });
    await harness.run();
    assert.deepEqual(harness.bans.map(ban => ban.id), ['above-owner']);
});

for (const [description, options, expected] of [
    ['cancellation', { choice: 'cancel' }, /Cancelled/],
    ['timeout', { timeout: true }, /expired/],
    ['empty roles', { members: [] }, /No eligible members/],
    ['protected members only', { members: [makeMember('owner')] }, /Skipped: 1/],
    ['revoked dashboard permission', { allowed: false }, /no longer have permission/],
    ['revoked Discord permission', { onConfirm: ({ moderator }) => { moderator.permissions.has = () => false; } }, /You need the Ban Members/],
]) {
    test(`${description} produces no bans`, async (t) => {
        const harness = createHarness(t, options);
        await harness.run();
        assert.equal(harness.bans.length, 0);
        assert.equal(harness.savedRecords.length, 0);
        assert.match(harness.result, expected);
        assert.equal(harness.edits.at(-1)?.components?.length || 0, 0);
    });
}

test('discovers matching members beyond the first 1000 members', async (t) => {
    const firstPage = Array.from({ length: 1000 }, (_, id) => makeMember(String(id), { hasRole: false }));
    const target = makeMember('1000');
    const harness = createHarness(t, { members: [target], pages: [firstPage, [target]] });
    await harness.run();
    assert.deepEqual(harness.listCalls, [
        { limit: 1000, after: undefined, cache: false },
        { limit: 1000, after: '999', cache: false },
    ]);
    assert.deepEqual(harness.bans.map(ban => ban.id), ['1000']);
});

test('incomplete member discovery never offers confirmation or bans a partial list', async (t) => {
    const page = Array.from({ length: 1000 }, (_, id) => makeMember(String(id)));
    const harness = createHarness(t, { pages: [page], listFailureAt: 2 });
    await harness.run();
    assert.equal(harness.bans.length, 0);
    assert.equal(harness.filter, undefined);
    assert.match(harness.result, /Could not load all server members/);
});

test('rechecks role membership and hierarchy and excludes members added after the preview', async (t) => {
    const harness = createHarness(t, {
        members: [makeMember('removed'), makeMember('promoted'), makeMember('left'), makeMember('remaining')],
        fetchFailures: { left: { code: 10007 } },
        onConfirm: ({ members }) => {
            members[0].roles.cache.clear();
            members[1].roles.highest.position = 15;
            members.push(makeMember('new'));
        },
    });
    await harness.run();
    assert.deepEqual(harness.bans.map(ban => ban.id), ['remaining']);
    assert.match(harness.result, /Banned: 1\. Skipped: 3\. Failed: 0/);
});

test('continues after fetch, ban, and record failures while reporting correct totals', async (t) => {
    const harness = createHarness(t, {
        members: [makeMember('unavailable'), makeMember('denied'), makeMember('success'), makeMember('success2')],
        fetchFailures: { unavailable: new Error('Network failed') },
        banFailures: ['denied'],
        logFailure: true,
    });
    await harness.run();
    assert.deepEqual(harness.banAttempts, ['denied', 'success', 'success2']);
    assert.deepEqual(harness.savedRecords.map(record => record.userId), ['success', 'success2']);
    assert.match(harness.result, /Banned: 2\. Skipped: 0\. Failed: 2/);
    assert.match(harness.result, /could not be saved for 2 successful bans/);
});

test('stops and preserves partial results if moderator permissions change mid-batch', async (t) => {
    const harness = createHarness(t, {
        members: [makeMember('first'), makeMember('second')],
        onBan: ({ moderator }) => { moderator.permissions.has = () => false; },
    });
    await harness.run();
    assert.deepEqual(harness.bans.map(ban => ban.id), ['first']);
    assert.match(harness.result, /Role ban stopped/);
    assert.match(harness.result, /Banned: 1/);
});

test('prevents overlapping role bans and releases the server after cancellation', async (t) => {
    let overlapChecks = 0;
    const harness = createHarness(t, {
        choice: 'cancel',
        onWait: async ({ command, interaction }) => {
            overlapChecks++;
            await command.execute({
                ...interaction,
                reply: async (payload) => assert.match(payload.content, /already being previewed or processed/),
            });
        },
    });
    await harness.run();
    await harness.run();
    assert.equal(overlapChecks, 2);
    assert.equal(harness.bans.length, 0);
});
