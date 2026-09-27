const api = window.dashboardApi;
const $ = (id) => document.getElementById(id);
const state = {
  guilds: [],
  botGuildIds: new Set(),
  botStatusKnown: false,
  selectedGuildId: null,
  roles: [],
  commands: [],
  baseCommands: [],
  permissions: null,
  originalPermissions: null,
  botInstalled: false,
  dirty: false,
  loading: false,
  saving: false,
  tab: "settings",
  selectedWarningUser: null,
  warningBusy: false,
  searchVersion: 0,
};
const pages = {
  settings: "Overview",
  permissions: "Permissions",
  warnings: "Warnings",
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const normalizeEntry = (entry = {}) => ({
  allowedRoleIds: Array.isArray(entry.allowedRoleIds)
    ? [...entry.allowedRoleIds]
    : [],
  allowedUserIds: Array.isArray(entry.allowedUserIds)
    ? [...entry.allowedUserIds]
    : [],
  restricted: Boolean(
    entry.allowedRoleIds?.length || entry.allowedUserIds?.length,
  ),
});
const normalizePermissions = (permissions = {}) => ({
  adminRoleIds: [...(permissions.adminRoleIds || [])],
  adminUserIds: [...(permissions.adminUserIds || [])],
  commandPermissions: Object.fromEntries(
    Object.entries(permissions.commandPermissions || {}).map(
      ([name, entry]) => [name, normalizeEntry(entry)],
    ),
  ),
});
const canonicalEntry = (entry = {}) =>
  JSON.stringify({
    roles: [...(entry.allowedRoleIds || [])].sort(),
    users: [...(entry.allowedUserIds || [])].sort(),
    restricted: Boolean(entry.restricted),
  });
const commandChanged = (name) =>
  canonicalEntry(state.permissions?.commandPermissions[name]) !==
    canonicalEntry(state.originalPermissions?.commandPermissions[name]) ||
  !state.baseCommands.includes(name);
const permissionSignature = (permissions) =>
  JSON.stringify({
    roles: [...(permissions?.adminRoleIds || [])].sort(),
    users: [...(permissions?.adminUserIds || [])].sort(),
    commands: state.commands
      .map((name) => [
        name,
        canonicalEntry(permissions?.commandPermissions[name]),
      ])
      .sort(),
  });
const setError = (error) => {
  if (!error) return api.clearErrorBanner($("errorBanner"));
  api.setErrorBanner(
    $("errorBanner"),
    error.message || "Please try again.",
    error.payload || { message: error.message },
  );
};
const parseIds = (value) => [...new Set(value.split(/[\s,]+/).filter(Boolean))];
const validIds = (ids) => ids.every((id) => /^\d{17,20}$/.test(id));
const readIds = (input) => {
  const ids = parseIds(input.value.trim());
  if (!validIds(ids)) {
    setError({
      message:
        "Use Discord user IDs with 17–20 digits, separated by spaces or commas.",
    });
    input.focus();
    return [];
  }
  setError(null);
  return ids;
};
const updateSummary = () => {
  const ready = Boolean(state.permissions);
  const total = state.commands.length;
  const restricted = state.commands.filter(
    (name) => state.permissions?.commandPermissions[name]?.restricted,
  ).length;
  const changed = state.commands.filter(commandChanged).length;
  $("navCommandCount").textContent = ready ? total : "–";
  $("overviewCommandCount").textContent = ready ? total : "–";
  $("overviewRoleCount").textContent = ready
    ? state.permissions.adminRoleIds.length
    : "–";
  $("overviewRestrictedCount").textContent = ready ? restricted : "–";
  $("permissionTotalCount").textContent = total;
  $("permissionRestrictedCount").textContent = restricted;
  $("permissionOpenCount").textContent = total - restricted;
  $("permissionChangedCount").textContent = changed;
  document
    .querySelectorAll(".command-card")
    .forEach((card) =>
      card.classList.toggle(
        "command-card--changed",
        commandChanged(card.dataset.command),
      ),
    );
};
const updateDirty = () => {
  state.dirty = Boolean(
    state.permissions &&
    state.originalPermissions &&
    (permissionSignature(state.permissions) !==
      permissionSignature(state.originalPermissions) ||
      state.commands.some((name) => !state.baseCommands.includes(name))),
  );
  $("saveBar").hidden = !state.dirty;
  updateSummary();
};
const syncVisibility = () => {
  const ready = Boolean(state.permissions) && !state.loading;
  ["settings", "permissions", "warnings"].forEach((name) => {
    $(`${name}Panel`).hidden = !ready || state.tab !== name;
  });
  $("overviewStats").hidden = state.tab !== "settings";
  $("contentSkeleton").hidden = !state.loading;
  $("workspaceEmpty").hidden = Boolean(state.selectedGuildId) || state.loading;
  $("botInactiveCallout").hidden =
    !state.selectedGuildId || state.botInstalled || !state.botStatusKnown;
  $("inviteButton").hidden = $("botInactiveCallout").hidden;
  $("saveBar").hidden = !state.dirty;
  $("savePermissionsButton").disabled = state.saving || state.loading;
  $("discardChangesButton").disabled = state.saving || state.loading;
};
const switchTab = (name) => {
  if (!pages[name]) return;
  state.tab = name;
  const label = pages[name];
  $("currentPage").textContent = label;
  $("pageTitle").textContent = label;
  document.title = `${label} · The Steward`;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
    if (tab.dataset.tab === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  syncVisibility();
};
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
const updateGuildHeader = () => {
  const guild = state.guilds.find(
    (entry) => entry.id === state.selectedGuildId,
  );
  $("guildHeaderName").textContent = guild?.name || "Select a server";
  $("guildHeaderFallback").textContent = initials(guild?.name || "Steward");
  $("guildHeaderIcon").hidden = !guild?.icon;
  $("guildHeaderFallback").hidden = Boolean(guild?.icon);
  if (guild?.icon)
    $("guildHeaderIcon").src =
      `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
  else $("guildHeaderIcon").removeAttribute("src");
  const known = guild && state.botStatusKnown;
  $("overviewBotStatus").textContent = !guild
    ? "–"
    : !known
      ? "Unknown"
      : state.botInstalled
        ? "Added"
        : "Not added";
  $("overviewBotStatus").classList.toggle(
    "is-connected",
    Boolean(known && state.botInstalled),
  );
  $("refreshBotButton").hidden = !guild;
};
const renderGuilds = () => {
  const query = $("guildSearch").value.trim().toLowerCase();
  const guilds = state.guilds.filter((guild) =>
    guild.name.toLowerCase().includes(query),
  );
  $("guildCount").textContent = state.guilds.length.toString().padStart(2, "0");
  $("guildList").replaceChildren();
  $("guildEmpty").hidden = guilds.length > 0;
  $("guildEmpty").textContent = query
    ? "No matching servers."
    : "No servers available. Manage Server permission required.";
  guilds.forEach((guild) => {
    const button = node(
      "button",
      `guild-item${guild.id === state.selectedGuildId ? " active" : ""}`,
    );
    button.type = "button";
    button.disabled = state.loading || state.saving;
    button.setAttribute(
      "aria-pressed",
      String(guild.id === state.selectedGuildId),
    );
    const info = node("span", "guild-item__info");
    const fallback = node("span", "guild-avatar", initials(guild.name));
    if (guild.icon) {
      const img = node("img");
      img.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
      img.alt = "";
      img.addEventListener("error", () => img.replaceWith(fallback), {
        once: true,
      });
      info.append(img);
    } else info.append(fallback);
    info.append(node("span", "guild-item__name", guild.name));
    const installed = state.botGuildIds.has(guild.id);
    const status = !state.botStatusKnown
      ? "Status unavailable"
      : installed
        ? "Bot added"
        : "Not invited";
    button.title = `${guild.name} · ${status}`;
    const badge = node(
      "span",
      `status-pill${installed ? " status-pill--ok" : ""}`,
    );
    badge.setAttribute("aria-label", status);
    badge.append(node("span", "status-pill__dot"));
    button.append(info, badge);
    button.addEventListener("click", () => selectGuild(guild.id));
    $("guildList").append(button);
  });
};
const renderChips = (container, ids, nameForId, onRemove, disabled = false) => {
  container.replaceChildren();
  container.hidden = !ids.length;
  ids.forEach((id) => {
    const chip = node("span", "chip", nameForId(id));
    const remove = node("button", "", "×");
    remove.type = "button";
    remove.disabled = disabled;
    remove.setAttribute("aria-label", `Remove ${nameForId(id)}`);
    remove.addEventListener("click", () => onRemove(id));
    chip.append(remove);
    container.append(chip);
  });
};
const renderRolePicker = (container, ids, onChange, label) => {
  container.replaceChildren();
  const wrapper = node("div", "multi-picker");
  const search = node("input", "multi-picker__search");
  search.type = "search";
  search.placeholder = "Find a role…";
  search.setAttribute("aria-label", `Search ${label}`);
  search.disabled = !state.botInstalled;
  const list = node("div", "multi-picker__list");
  const chips = node("div", "chip-list");
  const refreshChips = () => {
    renderChips(
      chips,
      ids,
      (id) =>
        state.roles.find((role) => role.id === id)?.name ||
        `Unavailable role · ${id}`,
      (id) => {
        ids.splice(ids.indexOf(id), 1);
        onChange();
        refreshList();
        refreshChips();
      },
      !state.botInstalled,
    );
  };
  const refreshList = () => {
    list.replaceChildren();
    const roles = state.roles
      .filter((role) =>
        role.name.toLowerCase().includes(search.value.toLowerCase()),
      )
      .sort((a, b) => b.position - a.position);
    if (!roles.length)
      list.append(
        node(
          "span",
          "field-hint",
          state.botInstalled
            ? "No matching roles."
            : "Server roles are unavailable.",
        ),
      );
    roles.forEach((role) => {
      const row = node("label");
      const checkbox = node("input");
      checkbox.type = "checkbox";
      checkbox.checked = ids.includes(role.id);
      checkbox.disabled = !state.botInstalled;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) ids.push(role.id);
        else ids.splice(ids.indexOf(role.id), 1);
        onChange();
        refreshChips();
      });
      const dot = node("span", "role-dot");
      if (
        Number.isInteger(role.color) &&
        role.color > 0 &&
        role.color <= 0xffffff
      )
        dot.style.setProperty(
          "--role-color",
          `#${role.color.toString(16).padStart(6, "0")}`,
        );
      row.append(checkbox, dot, document.createTextNode(role.name));
      list.append(row);
    });
  };
  search.addEventListener("input", refreshList);
  wrapper.append(search, list, chips);
  container.append(wrapper);
  refreshList();
  refreshChips();
};
const ensureCommands = () => {
  state.commands = [
    ...new Set([
      ...state.commands,
      ...Object.keys(state.permissions.commandPermissions),
    ]),
  ].sort();
  const entries = state.permissions.commandPermissions;
  state.permissions.commandPermissions = Object.fromEntries(
    state.commands.map((name) => [
      name,
      Object.hasOwn(entries, name) ? entries[name] : normalizeEntry(),
    ]),
  );
};
const renderAdminUsers = () =>
  renderChips(
    $("adminUserChips"),
    state.permissions.adminUserIds,
    (id) => id,
    (id) => {
      state.permissions.adminUserIds = state.permissions.adminUserIds.filter(
        (entry) => entry !== id,
      );
      updateDirty();
      renderAdminUsers();
    },
    !state.botInstalled,
  );
const renderCommands = () => {
  $("commandsList").replaceChildren();
  if (!state.permissions) return;
  const query = $("commandSearch")
    .value.trim()
    .toLowerCase()
    .replace(/^\//, "");
  const filter = $("commandFilter").value;
  const names = state.commands.filter(
    (name) =>
      name.toLowerCase().includes(query) &&
      (filter === "all" ||
        (filter === "restricted" &&
          state.permissions.commandPermissions[name].restricted) ||
        (filter === "open" &&
          !state.permissions.commandPermissions[name].restricted) ||
        (filter === "changed" && commandChanged(name))),
  );
  $("commandsEmpty").hidden = names.length > 0;
  names.forEach((name) => {
    const config = state.permissions.commandPermissions[name];
    const card = node(
      "article",
      `command-card${commandChanged(name) ? " command-card--changed" : ""}`,
    );
    card.dataset.command = name;
    const header = node("div", "command-card__header");
    const title = node("div", "command-card__title");
    title.append(node("strong", "", `/${name}`));
    const toggleLabel = node("label", "toggle");
    const toggle = node("input");
    toggle.type = "checkbox";
    toggle.checked = config.restricted;
    toggle.disabled = !state.botInstalled;
    toggle.setAttribute("aria-label", `Restrict /${name}`);
    toggle.id = `restrict-${name}`;
    toggleLabel.append(document.createTextNode("Restricted"), toggle);
    header.append(title, toggleLabel);
    card.append(header);
    toggle.addEventListener("change", () => {
      config.restricted = toggle.checked;
      if (!toggle.checked) {
        config.allowedRoleIds = [];
        config.allowedUserIds = [];
      }
      updateDirty();
      renderCommands();
      document
        .getElementById(`restrict-${name}`)
        ?.focus({ preventScroll: true });
    });
    if (config.restricted) {
      const body = node("div", "command-card__body");
      const roles = node("div", "field");
      roles.append(node("span", "", "Allowed roles"));
      const picker = node("div");
      roles.append(picker);
      const note = node("p", "command-card__note");
      const updateNote = () => {
        note.hidden = Boolean(
          config.allowedRoleIds.length || config.allowedUserIds.length,
        );
        note.textContent = "Select at least one role or member.";
      };
      renderRolePicker(
        picker,
        config.allowedRoleIds,
        () => {
          updateDirty();
          updateNote();
        },
        `roles for /${name}`,
      );
      const users = node("div", "field");
      const label = node("label", "", "Allowed members");
      const input = node("input");
      input.type = "text";
      input.placeholder = "Paste Discord user IDs";
      input.id = `users-${name}`;
      input.disabled = !state.botInstalled;
      label.htmlFor = input.id;
      const add = node("button", "button", "Add");
      add.type = "button";
      add.disabled = !state.botInstalled;
      const row = node("div", "input-row");
      row.append(input, add);
      const chips = node("div", "chip-list");
      const refreshUsers = () =>
        renderChips(
          chips,
          config.allowedUserIds,
          (id) => id,
          (id) => {
            config.allowedUserIds = config.allowedUserIds.filter(
              (entry) => entry !== id,
            );
            updateDirty();
            refreshUsers();
            updateNote();
          },
          !state.botInstalled,
        );
      const addUsers = () => {
        const ids = readIds(input);
        if (!ids.length) return;
        config.allowedUserIds = [
          ...new Set([...config.allowedUserIds, ...ids]),
        ];
        input.value = "";
        updateDirty();
        refreshUsers();
        updateNote();
      };
      add.addEventListener("click", addUsers);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") addUsers();
      });
      users.append(label, row, chips);
      refreshUsers();
      updateNote();
      body.append(roles, users, note);
      card.append(body);
    }
    $("commandsList").append(card);
  });
  updateSummary();
};
const renderPanels = () => {
  if (!state.permissions) return;
  renderRolePicker(
    $("adminRolesPicker"),
    state.permissions.adminRoleIds,
    updateDirty,
    "admin roles",
  );
  renderAdminUsers();
  renderCommands();
  updateSummary();
  [
    "adminUserInput",
    "addAdminUserButton",
    "newCommandInput",
    "addCommandButton",
    "clearAllCommands",
    "copyFromGuild",
  ].forEach((id) => {
    $(id).disabled = !state.botInstalled;
  });
  $("copyFromGuild").disabled = !state.botInstalled || state.guilds.length < 2;
  $("warningsUserSearch").disabled = !state.botInstalled;
  syncVisibility();
};
const loadBotGuilds = async () => {
  try {
    const data = await api.fetchJson("/api/bot/guilds");
    state.botGuildIds = new Set(data.guildIds || []);
    state.botStatusKnown = true;
  } catch (error) {
    state.botStatusKnown = false;
    setError(error);
  }
};
const resetWarningHistory = () => {
  $("warningsList").replaceChildren();
  $("warningsTotalCount").textContent = "–";
  $("warningsLatestDate").textContent = "–";
  $("warningsEmpty").hidden = false;
  $("warningsEmpty").textContent = "Select a member to view warnings.";
};
const warningTarget = () => $("warningsUserInput").value.trim();
const setWarningTarget = (member = null) => {
  state.selectedWarningUser = member;
  if (member) $("warningsUserInput").value = member.id;
  const id = warningTarget();
  $("warningsSelectedUser").textContent = member
    ? member.nick ||
      member.user?.global_name ||
      member.user?.username ||
      member.id
    : id || "No member selected";
  $("warningsSelectedCard").hidden = !id;
  $("warningsSelectedHint").textContent = member ? id : "";
  $("warningReasonInput").value = "";
  $("warningStatus").textContent = "";
  updateWarningCount();
  resetWarningHistory();
  document
    .querySelectorAll(".member-item")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.userId === id),
    );
};
const resetWarningSelection = () => {
  state.searchVersion += 1;
  $("warningsUserInput").value = "";
  $("warningsUserSearch").value = "";
  $("warningsUserResults").replaceChildren();
  $("warningsSearchStatus").textContent = "";
  setWarningTarget();
};
const loadGuildDetails = async () => {
  if (!state.selectedGuildId) {
    syncVisibility();
    return;
  }
  state.loading = true;
  state.permissions = null;
  state.originalPermissions = null;
  state.commands = [];
  state.roles = [];
  state.dirty = false;
  state.botInstalled =
    state.botGuildIds.has(state.selectedGuildId) && state.botStatusKnown;
  resetWarningSelection();
  updateGuildHeader();
  updateSummary();
  syncVisibility();
  renderGuilds();
  try {
    const [permissions, commands] = await Promise.all([
      api.fetchJson(`/api/guilds/${state.selectedGuildId}/permissions`),
      api.fetchJson(`/api/guilds/${state.selectedGuildId}/commands`),
    ]);
    if (state.botInstalled) {
      try {
        state.roles =
          (await api.fetchJson(`/api/guilds/${state.selectedGuildId}/roles`))
            .roles || [];
      } catch (error) {
        if (error.code === "BOT_NOT_IN_GUILD") {
          state.botInstalled = false;
          state.botGuildIds.delete(state.selectedGuildId);
        } else setError(error);
      }
    }
    state.permissions = normalizePermissions(permissions.permissions || {});
    state.commands = commands.commands || [];
    ensureCommands();
    state.baseCommands = [...state.commands];
    state.originalPermissions = clone(state.permissions);
    renderPanels();
    updateGuildHeader();
  } catch (error) {
    setError(error);
  } finally {
    state.loading = false;
    syncVisibility();
    renderGuilds();
  }
};
const selectGuild = async (id) => {
  if (state.loading || state.saving || state.warningBusy) return;
  if (
    state.dirty &&
    !window.confirm("Discard your unsaved changes and switch servers?")
  )
    return;
  setError(null);
  state.selectedGuildId = id;
  await loadGuildDetails();
};
const savePermissions = async () => {
  if (!state.permissions || state.saving || state.loading || !state.dirty)
    return;
  const incomplete = state.commands.find((name) => {
    const entry = state.permissions.commandPermissions[name];
    return (
      entry.restricted &&
      !entry.allowedRoleIds.length &&
      !entry.allowedUserIds.length
    );
  });
  if (incomplete) {
    switchTab("permissions");
    $("commandSearch").value = incomplete;
    $("commandFilter").value = "all";
    renderCommands();
    setError({
      message: `Select a role or member for /${incomplete}, or turn off its restriction before saving.`,
    });
    return;
  }
  state.saving = true;
  state.loading = true;
  syncVisibility();
  renderGuilds();
  $("savePermissionsButton").textContent = "Saving…";
  try {
    const payload = {
      adminRoleIds: state.permissions.adminRoleIds,
      adminUserIds: state.permissions.adminUserIds,
      commandPermissions: Object.fromEntries(
        state.commands.map((name) => {
          const { allowedRoleIds, allowedUserIds } =
            state.permissions.commandPermissions[name];
          return [name, { allowedRoleIds, allowedUserIds }];
        }),
      ),
    };
    const data = await api.fetchJson(
      `/api/guilds/${state.selectedGuildId}/permissions`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
    state.permissions = normalizePermissions(data.permissions || payload);
    ensureCommands();
    state.originalPermissions = clone(state.permissions);
    state.baseCommands = [...state.commands];
    updateDirty();
    renderPanels();
    setError(null);
    api.showToast("Changes saved.", "success");
  } catch (error) {
    setError(error);
  } finally {
    state.saving = false;
    state.loading = false;
    $("savePermissionsButton").textContent = "Save changes";
    syncVisibility();
    renderGuilds();
  }
};
const discardChanges = () => {
  if (!state.originalPermissions || state.saving) return;
  state.permissions = clone(state.originalPermissions);
  state.commands = [...state.baseCommands];
  updateDirty();
  renderPanels();
  setError(null);
};
const addAdminUser = () => {
  if (!state.permissions || !state.botInstalled) return;
  const ids = readIds($("adminUserInput"));
  if (!ids.length) return;
  state.permissions.adminUserIds = [
    ...new Set([...state.permissions.adminUserIds, ...ids]),
  ];
  $("adminUserInput").value = "";
  updateDirty();
  renderAdminUsers();
};
const addCommand = () => {
  if (!state.permissions || !state.botInstalled) return;
  const name = $("newCommandInput")
    .value.trim()
    .toLowerCase()
    .replace(/^\//, "");
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
    setError({
      message:
        "Use a command name of 1–32 letters, numbers, hyphens or underscores.",
    });
    return;
  }
  if (!state.commands.includes(name)) {
    state.commands.push(name);
    ensureCommands();
  }
  $("newCommandInput").value = "";
  $("commandSearch").value = name;
  $("commandFilter").value = "all";
  updateDirty();
  renderCommands();
  setError(null);
};
const searchWarningMembers = async () => {
  const query = $("warningsUserSearch").value.trim();
  const version = ++state.searchVersion;
  const guildId = state.selectedGuildId;
  $("warningsUserResults").replaceChildren();
  if (!guildId || !state.botInstalled || query.length < 2) {
    $("warningsSearchStatus").textContent = query
      ? "Enter at least 2 characters."
      : "";
    return;
  }
  $("warningsSearchStatus").textContent = "Looking up members…";
  try {
    const data = await api.fetchJson(
      `/api/guilds/${guildId}/members?query=${encodeURIComponent(query)}`,
    );
    if (version !== state.searchVersion || guildId !== state.selectedGuildId)
      return;
    const members = data.members || [];
    $("warningsSearchStatus").textContent = members.length
      ? `${members.length} member${members.length === 1 ? "" : "s"} found`
      : "No matching members.";
    members.forEach((member) => {
      const button = node(
        "button",
        `member-item${warningTarget() === member.id ? " active" : ""}`,
      );
      button.type = "button";
      button.dataset.userId = member.id;
      const meta = node("span", "member-item__meta");
      meta.append(
        node(
          "span",
          "member-item__name",
          member.nick ||
            member.user?.global_name ||
            member.user?.username ||
            member.id,
        ),
        node("span", "member-item__id", member.id),
      );
      button.append(meta);
      button.addEventListener("click", () => {
        if (!state.warningBusy) setWarningTarget(member);
      });
      $("warningsUserResults").append(button);
    });
  } catch (error) {
    if (version !== state.searchVersion || guildId !== state.selectedGuildId)
      return;
    $("warningsSearchStatus").textContent =
      "Search unavailable. Enter a user ID instead.";
    setError(error);
  }
};
const renderWarnings = (warnings) => {
  $("warningsList").replaceChildren();
  $("warningsEmpty").hidden = warnings.length > 0;
  $("warningsEmpty").textContent = "No warnings.";
  $("warningsTotalCount").textContent = warnings.length;
  const dates = warnings
    .filter((warning) => warning.createdAt)
    .map((warning) => new Date(warning.createdAt))
    .filter((date) => !Number.isNaN(date.getTime()));
  $("warningsLatestDate").textContent = dates.length
    ? new Date(Math.max(...dates)).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "None";
  [...warnings].reverse().forEach((warning) => {
    const item = node("li", "warning-item");
    const meta = node("div", "warning-item__meta");
    meta.append(
      node("span", "", `Moderator: ${warning.moderatorId || "Unknown"}`),
      node(
        "span",
        "",
        warning.createdAt
          ? new Date(warning.createdAt).toLocaleString()
          : "Unknown date",
      ),
    );
    const copy = node("button", "button button--ghost", "Copy moderator ID");
    copy.type = "button";
    copy.disabled = !warning.moderatorId;
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(warning.moderatorId);
        api.showToast("Moderator ID copied.");
      } catch {
        api.showToast("Unable to copy the moderator ID.", "error");
      }
    });
    item.append(node("p", "", warning.reason), meta, copy);
    $("warningsList").append(item);
  });
};
const updateWarningCount = () => {
  $("warningCharCount").textContent =
    `${$("warningReasonInput").value.length}/500`;
};
const warningAction = async (method = "GET") => {
  if (!state.selectedGuildId || state.warningBusy || state.loading) return;
  const id = warningTarget();
  if (!/^\d{17,20}$/.test(id)) {
    setError({
      message:
        "Select a member or enter a valid Discord user ID (17–20 digits).",
    });
    $("warningsUserInput").focus();
    return;
  }
  const reason = $("warningReasonInput").value.trim();
  if (method === "POST" && (!reason || reason.length > 500)) {
    $("warningStatus").textContent =
      "Please enter a reason of 1–500 characters.";
    $("warningReasonInput").focus();
    return;
  }
  if (
    method === "DELETE" &&
    !window.confirm(
      `Clear all warnings for member ${id}? This cannot be undone.`,
    )
  )
    return;
  const guildId = state.selectedGuildId;
  state.warningBusy = true;
  $("warningsSpinner").hidden = false;
  const locked = [
    "fetchWarningsButton",
    "clearWarningsButton",
    "addWarningButton",
    "warningsUserInput",
    "warningsUserSearch",
    "warningReasonInput",
  ];
  const previousDisabled = locked.map((key) => $(key).disabled);
  locked.forEach((key) => {
    $(key).disabled = true;
  });
  try {
    const data = await api.fetchJson(`/api/guilds/${guildId}/warnings/${id}`, {
      method,
      ...(method === "POST" ? { body: JSON.stringify({ reason }) } : {}),
    });
    if (guildId !== state.selectedGuildId || id !== warningTarget()) return;
    renderWarnings(data.warnings || []);
    setError(null);
    if (method !== "GET") {
      const message =
        method === "POST"
          ? "Warning added to the member record."
          : "Warnings cleared.";
      $("warningStatus").textContent = message;
      api.showToast(message);
      if (method === "POST") {
        $("warningReasonInput").value = "";
        updateWarningCount();
      }
    }
  } catch (error) {
    setError(error);
  } finally {
    state.warningBusy = false;
    $("warningsSpinner").hidden = true;
    locked.forEach((key, i) => {
      $(key).disabled = previousDisabled[i];
    });
  }
};
const refreshBotStatus = async () => {
  if (state.loading || state.saving || state.warningBusy) return;
  if (
    state.dirty &&
    !window.confirm("Discard unsaved changes and refresh this server?")
  )
    return;
  state.loading = true;
  syncVisibility();
  renderGuilds();
  $("refreshBotButton").disabled = true;
  setError(null);
  await loadBotGuilds();
  await loadGuildDetails();
  $("refreshBotButton").disabled = false;
};
const openInvite = async () => {
  $("inviteButton").disabled = true;
  try {
    const data = await api.fetchJson(
      `/api/invite-url?guildId=${state.selectedGuildId}`,
    );
    if (data.inviteUrl) window.location.assign(data.inviteUrl);
  } catch (error) {
    setError(error);
  } finally {
    $("inviteButton").disabled = false;
  }
};
const openCopyModal = () => {
  $("copyGuildSelect").replaceChildren();
  state.guilds
    .filter((guild) => guild.id !== state.selectedGuildId)
    .forEach((guild) => {
      const option = node("option", "", guild.name);
      option.value = guild.id;
      $("copyGuildSelect").append(option);
    });
  $("confirmCopyButton").disabled = !$("copyGuildSelect").options.length;
  $("copyModal").showModal();
};
const confirmCopy = async () => {
  const guildId = $("copyGuildSelect").value;
  if (!guildId || !state.permissions) return;
  const targetGuildId = state.selectedGuildId;
  $("confirmCopyButton").disabled = true;
  try {
    const data = await api.fetchJson(`/api/guilds/${guildId}/permissions`);
    if (state.selectedGuildId !== targetGuildId || !state.permissions) return;
    state.permissions = normalizePermissions(data.permissions || {});
    ensureCommands();
    updateDirty();
    renderPanels();
    api.showToast("Permissions copied. Review before saving.");
    $("copyModal").close();
  } catch (error) {
    $("copyModal").close();
    setError(error);
  } finally {
    $("confirmCopyButton").disabled = false;
  }
};
const initDashboard = async () => {
  document
    .querySelectorAll(".tab")
    .forEach((tab) =>
      tab.addEventListener("click", () => switchTab(tab.dataset.tab)),
    );
  document.querySelectorAll("[data-open-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      switchTab(button.dataset.openTab);
      $("mainContent").focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }),
  );
  $("guildSearch").addEventListener("input", renderGuilds);
  $("commandSearch").addEventListener("input", renderCommands);
  $("commandFilter").addEventListener("change", renderCommands);
  $("addAdminUserButton").addEventListener("click", addAdminUser);
  $("adminUserInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addAdminUser();
  });
  $("addCommandButton").addEventListener("click", addCommand);
  $("newCommandInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addCommand();
  });
  $("savePermissionsButton").addEventListener("click", savePermissions);
  $("discardChangesButton").addEventListener("click", discardChanges);
  $("fetchWarningsButton").addEventListener("click", () => warningAction());
  $("addWarningButton").addEventListener("click", () => warningAction("POST"));
  $("clearWarningsButton").addEventListener("click", () =>
    warningAction("DELETE"),
  );
  $("warningReasonInput").addEventListener("input", updateWarningCount);
  const debouncedSearch = api.debounce(searchWarningMembers, 250);
  $("warningsUserSearch").addEventListener("input", () => {
    state.searchVersion += 1;
    debouncedSearch();
  });
  $("warningsUserInput").addEventListener("input", () => setWarningTarget());
  $("inviteButton").addEventListener("click", openInvite);
  $("refreshBotButton").addEventListener("click", refreshBotStatus);
  $("clearAllCommands").addEventListener("click", () => {
    if (!state.permissions || !state.botInstalled) return;
    if (
      !window.confirm(
        "Reset all custom command restrictions? Review and save to apply this change.",
      )
    )
      return;
    state.commands.forEach((name) => {
      state.permissions.commandPermissions[name] = normalizeEntry();
    });
    updateDirty();
    renderCommands();
  });
  $("copyFromGuild").addEventListener("click", openCopyModal);
  $("cancelCopyButton").addEventListener("click", () => $("copyModal").close());
  $("confirmCopyButton").addEventListener("click", confirmCopy);
  $("guildHeaderIcon").addEventListener("error", () => {
    $("guildHeaderIcon").hidden = true;
    $("guildHeaderFallback").hidden = false;
  });
  $("logoutButton").addEventListener("click", async () => {
    if (state.saving || state.warningBusy) return;
    if (state.dirty && !window.confirm("Discard unsaved changes and log out?"))
      return;
    try {
      await api.fetchJson("/auth/logout", { method: "POST" });
      state.dirty = false;
      window.location.href = "/";
    } catch (error) {
      setError(error);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  $("guildListSkeleton").hidden = false;
  $("guildList").hidden = true;
  try {
    const session = await api.fetchJson("/api/me");
    api.setCsrfToken(session.csrfToken);
    const displayName =
      session.user?.global_name || api.formatUserDisplay(session.user);
    $("userDisplay").textContent = displayName;
    $("userInitial").textContent = initials(displayName);
    $("sessionExpiry").textContent = "Discord account";
    if (session.expiresAt)
      $("sessionExpiry").title =
        `Session expires ${new Date(session.expiresAt).toLocaleString()}`;
  } catch (error) {
    if (error.status === 401 || error.status === 403)
      window.location.replace("/");
    else setError(error);
    $("guildListSkeleton").hidden = true;
    return;
  }
  try {
    const [guildData] = await Promise.all([
      api.fetchJson("/api/guilds"),
      loadBotGuilds(),
    ]);
    state.guilds = guildData.guilds || [];
    state.selectedGuildId = state.guilds[0]?.id || null;
    renderGuilds();
    await loadGuildDetails();
  } catch (error) {
    setError(error);
  } finally {
    $("guildListSkeleton").hidden = true;
    $("guildList").hidden = false;
    syncVisibility();
  }
};
document.addEventListener("DOMContentLoaded", initDashboard);
