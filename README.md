Im going to make a To-do List for the features i want to implement for my Bot.

### **To-Do List for My Discord Bot**

#### **Core Features**
(I will try to make these tools optional, because alot of bots already feature them)

1. **Basic Commands**
   - [x] Add a `!help` command to display a list of available commands.
   - [x] Implement a `!ping` command to check bot responsiveness.
   - [ **Only Text missing** ] Add a `!about` command to describe the bot's purpose.

2. **Role Management**
   - [ ] Set up a self-assignable role system (e.g., using reaction roles).
   - [ ] Allow admins to assign/remove roles with commands.

3. **Moderation Tools**
   - [ ] Add commands to mute, x kick, and x temp_ban users.
   - [ ] Create an auto-moderation feature to delete spam or inappropriate content.
   - [ ] Implement a warning system with a strike counter.

---

#### **Unique Features**
1. **Currency System**
   - [ ] Design a virtual currency system with basic commands:
     - [ ] `!balance` to check currency balance.
     - [ ] `!earn` to earn daily or periodic rewards.
     - [ ] `!transfer @user [amount]` to send currency to another user.
   - [ ] Link the currency system to role management:
     - [ ] Allow users to purchase roles using the currency with a command (e.g., `!buyrole [role name]`).

2. **Datetime Converter**
   (Still in Progress, maybe i'll add visual Menu)
   - [x] Create a command to convert timezones:
     - [x] `!convert [time] [timezone] to [timezone]` to handle conversions.
     - [x] Support both 12-hour and 24-hour formats.
   - [ ] Include a command to display server-specific or user-specific timezones.

3. **Minigames**
   - [ ] Implement a Quiz Game:
     - [ ] Add a `!quiz` command to start the game.
     - [ ] Provide multiple-choice or true/false questions.
     - [ ] Award virtual currency for correct answers.
   - [ ] Add a simple number-guessing game (e.g., `!guess [number]`).
   - [ ] Create a leaderboard for game winners.

---

#### **Utility Tools**
1. **Search and Lookups**
   - [ ] Add a `!wiki [topic]` command to fetch summaries from Wikipedia.
   - [ ] Include a `!weather [location]` command for weather updates.

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
