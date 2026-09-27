Im going to make a To-do List for the features i want to implement for my Bot.

### **To-Do List for My Discord Bot**

#### **Core Features**
(I will try to make these tools optional, because alot of bots already feature them)

1. **Basic Commands**
   - [x] Add a `/help` command to display a list of available commands.
   - [x] Implement a `/ping` command to check bot responsiveness.
   - [x] Add an `/about` command to describe the bot's purpose.

2. **Role Management**
   - [ ] Set up a self-assignable role system (e.g., using reaction roles).
   - [x] Allow admins to assign/remove roles with commands.

3. **Moderation Tools**
   - [x] Add commands to mute, kick, and temp_ban users.
   - [x] Add `/ban-role` to ban members with a selected role after confirmation.
   - [ ] Create an auto-moderation feature to delete spam or inappropriate content.
   - [x] Implement a warning system with a strike counter.

---

#### **Unique Features**
1. **Currency System**
   - [x] Design a virtual currency system with basic commands:
     - [x] `/balance` to check currency balance.
     - [x] `/earn` to earn daily or periodic rewards.
     - [x] `/transfer @user [amount]` to send currency to another user.
   - [ ] Link the currency system to role management:
     - [ ] Allow users to purchase roles using the currency with a command (e.g., `!buyrole [role name]`).

2. **Datetime Converter**
   (Still in Progress, maybe i'll add visual Menu)
   - [x] Create a command to convert timezones:
     - [x] `/timestamp [date]` to generate Discord timestamps.
     - [x] Support multiple Discord timestamp formats.
   - [ ] Include a command to display server-specific or user-specific timezones.

3. **Minigames**
   - [ ] Implement a Quiz Game:
     - [x] Add a `/quiz` command to start the game.
     - [x] Provide multiple-choice or true/false questions.
     - [x] Award virtual currency for correct answers.
   - [ ] Add a simple number-guessing game (e.g., `!guess [number]`).
   - [ ] Create a leaderboard for game winners.

---

#### **Utility Tools**
1. **Search and Lookups**
   - [x] Add a `/wiki [topic]` command to fetch summaries from Wikipedia.
   - [x] Include a `/weather [location]` command for weather updates.

---

#### **Advanced and Fun Features (very optional)**
1. **AI Chat Integration**
   - [ ] Integrate GPT for conversational AI:
     - [ ] Respond to mentions with intelligent replies.
     - [ ] Allow users to ask general questions with `!ask [question]`.

---

#### **Deployment (will happen if im completly satisfied with the bot)**
1. **Hosting**
   - [ ] Set up local hosting for development.
   - [ ] Deploy the bot on a cloud platform (e.g., Heroku, AWS, or Railway).

2. **Monitoring**
   - [ ] Add logging to track errors and usage statistics.
   - [ ] Implement uptime monitoring to ensure the bot stays online.

---

### **Server-Specific Permission Configuration**
Moderation commands support per-server permission overrides stored in MongoDB. Each guild can define which users or roles are allowed to run specific commands, plus optional admin overrides that apply to all moderation commands. This is intended for future web-based configuration.

Example document stored in the `discord.guild_permissions` collection:
```json
{
  "guildId": "1234567890",
  "adminUserIds": ["1111111111"],
  "adminRoleIds": ["2222222222"],
  "commandPermissions": {
    "kick": {
      "allowedUserIds": ["3333333333"],
      "allowedRoleIds": ["4444444444"]
    }
  }
}
```

---

### **Configuration**
Set secrets via environment variables, or copy `config.example.json` to `config.json` and fill in your own values.

Recommended env vars:
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `MONGODB_URI`

### **Banning members by role**

Use `/ban-role role:@Role reason:Reason for the bans`. The bot privately previews the
number of eligible members and asks you to confirm within 60 seconds. Bans are permanent
and existing messages are kept. Both you and the bot need **Ban Members** permission.
The command skips you, the server owner, the bot itself, and members whose highest role
is equal to or above yours or the bot's (the server owner bypasses their own hierarchy check).
`@everyone` cannot be selected. Only members included in the preview can be banned;
their role membership and hierarchy are checked again before each ban.

Enable **Server Members Intent** under **Bot > Privileged Gateway Intents** in the
[Discord Developer Portal](https://discord.com/developers/applications) so the bot can
[list all guild members](https://docs.discord.com/developers/resources/guild#list-guild-members).
Member discovery uses paginated REST requests, so no Gateway intent change is needed in `index.js`.
Run `npm run deploy:commands` and restart the bot after installing the command.

The result reports successful bans, skipped members, failed requests, and any moderation
record failures separately. Long batches stop after about 14 minutes and report how many
members remain; run the command again to preview and continue. `/ban-role` also appears
automatically in `/help` and the dashboard's moderation permission settings.
