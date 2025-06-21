# Minecraft Discord Server Bot

A Discord bot for managing Minecraft servers with RCON integration, server management, and moderation features.

## Features

### 🎮 Server Management
- **Start/Stop Server**: Launch vanilla or modded Minecraft servers
- **Server Status**: Check if the server is running
- **Automatic Shutdown**: Server automatically shuts down after 3 minutes of inactivity
- **RCON Integration**: Send commands directly to the Minecraft server console

### 🛡️ Moderation Tools
- **Ban/Kick Users**: Remove problematic users from the Discord server
- **Timeout Management**: Temporarily restrict users with flexible duration options
- **Warning System**: Issue warnings to users with DM notifications
- **Message Purging**: Bulk delete messages from channels
- **Punishment History**: Track and view user punishment records

### 📊 Utility Commands
- **User Information**: Get detailed info about Discord members
- **Ping Check**: Monitor bot latency and response times
- **Server Chat**: Send messages to Minecraft server chat via Discord

## Prerequisites

Before setting up the bot, ensure you have:

1. **Node.js** (v16 or higher)
2. **Java** (for running Minecraft servers)
3. **NPM** (for installing dependencies)
4. **Discord Bot Token** (from Discord Developer Portal)
5. **Minecraft Server** with RCON enabled
6. **playit.gg** (optional, for external server access)

## Installation

1. **Clone or download** the bot files to your server directory

2. **Download [Node.js](https://nodejs.org/en)**

3. **Install dependencies**:

   `npm install discord.js ini rcon`

4. **Configure the bot** by editing `config.ini` (see Configuration section)

5. **Run the bot**:

   `node Bot.js`

## Configuration

### Discord Setup

1. **Create a Discord Application**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot
   - Copy the bot token

2. **Get Discord IDs**:
   - Enable Developer Mode in Discord settings
   - Right-click on your server → "Copy Server ID"
   - Right-click on channels → "Copy Channel ID"
   - Right-click on the bot → "Copy User ID" (for client_id)

### config.ini Setup

Edit the `config.ini` file with your specific values:

```ini
[discord]
token = YOUR_BOT_TOKEN_HERE
guild_id = YOUR_DISCORD_SERVER_ID
client_id = YOUR_BOT_CLIENT_ID
channel_id = MAIN_COMMAND_CHANNEL_ID
notify_id = LOG_CHANNEL_ID

[rcon]
host = 127.0.0.1
port = 25575
password = YOUR_RCON_PASSWORD

[minecraft]
vanilla_jar = C:/path/to/your/vanilla/server.jar
modded_jar = C:/path/to/your/modded/server.jar
vanilla_dir = C:/path/to/vanilla/server/directory/
modded_dir = C:/path/to/modded/server/directory/
mc_max_memory = 12288M

[general]
debug_mode = false
```

### Minecraft Server Setup

1. **Enable RCON** in your `server.properties`:
   ```properties
   enable-rcon=true
   rcon.port=25575
   rcon.password=your_rcon_password_here
   ```

2. **Restart your Minecraft server** to apply RCON settings

### Discord Permissions

The bot requires these permissions in your Discord server:
- Read Messages/View Channels
- Send Messages
- Use Slash Commands
- Manage Messages (for purge command)
- Ban Members
- Kick Members
- Moderate Members (for timeouts)
- Administrator (for clearing punishment history)

### Role Setup

Create an **"RCON Access"** role in your Discord server for users who should be able to:
- Send RCON commands
- Send messages to Minecraft server chat
- Use server management features

## Commands

### Server Management
| Command               | Description                             | Permissions Required |
|-----------------------|-----------------------------------------|----------------------|
| `/startserver [mode]` | Start Minecraft server (vanilla/modded) | None                 |
| `/stopserver`         | Stop the running server                 | None                 |
| `/status`             | Check server status                     | Manage Messages      |
| `/rcon <command>`     | Send RCON command to server             | RCON Access role     |
| `/say <message>`      | Send message to server chat             | RCON Access role     |
|-----------------------|-----------------------------------------|----------------------|

### Moderation
| Command                               | Description             | Permissions Required |
|---------------------------------------|-------------------------|----------------------|
| `/ban <user> [reason]`                | Ban a user              | Ban Members          |
| `/kick <user> [reason]`               | Kick a user             | Kick Members         |
| `/timeout <user> <duration> [reason]` | Timeout a user          | Moderate Members     |
| `/untimeout <user> [reason]`          | Remove timeout          | Moderate Members     |
| `/warn <user> <reason>`               | Warn a user             | Manage Messages      |
| `/purge <amount>`                     | Delete messages (1-100) | Manage Messages      |
|---------------------------------------|-------------------------|----------------------|

### Information & Utility
| Command                | Description              | Permissions Required |
|------------------------|--------------------------|----------------------|
| `/userinfo [user]`     | Get user information     | Manage Messages      |
| `/punishments <user>`  | View punishment history  | Manage Messages      |
| `/clearhistory <user>` | Clear punishment history | Administrator        |
| `/ping`                | Check bot latency        | Manage Messages      |
|------------------------|--------------------------|----------------------|

## Timeout Duration Format

When using the `/timeout` command, use these formats:
- `10s` - 10 seconds
- `5m` - 5 minutes  
- `2h` - 2 hours
- `1d` - 1 day
- Maximum: 28 days

## Features in Detail

### Automatic Server Shutdown
The bot monitors server activity and automatically shuts down the server after 3 minutes of inactivity to save resources. Activity is detected through:
- Player joins/leaves
- Chat messages
- Server commands
- Tick loop activity

### Punishment History
All moderation actions are automatically logged and stored in memory:
- Bans, kicks, timeouts, and warnings are tracked
- View up to 10 most recent punishments per user
- Administrators can clear punishment history
- Automatic notifications sent to the log channel

### RCON Integration
Direct communication with your Minecraft server:
- Send any server command
- Broadcast messages to players
- Real-time server management
- Secure password-protected connection

## Troubleshooting

### Common Issues

**Bot doesn't respond to commands:**
- Check if slash commands are registered (wait a few minutes after startup)
- Verify bot has proper permissions in the server
- Check console for error messages

**RCON commands fail:**
- Ensure RCON is enabled in `server.properties`
- Verify RCON host, port, and password in config
- Make sure Minecraft server is running

**Server won't start:**
- Check Java installation and PATH
- Verify server.jar file paths in config
- Ensure server directories exist
- Check if server files are corrupted

**Permission errors:**
- Verify Discord permissions for the bot
- Check if users have required roles
- Ensure role hierarchy is correct

### Debug Mode

Enable debug mode in `config.ini` to see detailed logs:
```ini
debug_mode = true
```

**⚠️ Security Warning**: Debug mode will print your bot token to the console. Only enable this for troubleshooting and never share console output publicly.

## Security Considerations

1. **Never share your bot token** - Keep it private and secure
2. **Use strong RCON passwords** - Protect your server console access  
3. **Limit RCON Access role** - Only give to trusted users
4. **Regular backups** - Keep your server data backed up
5. **Monitor logs** - Check the notification channel for unusual activity

## External Access (Optional)

The bot includes integration with playit.gg for external server access. To use:

1. Install playit.gg client
2. Ensure the path in `launchServer()` function matches your installation
3. Configure port forwarding as needed

## Support

If you encounter issues:
1. Check the troubleshooting section
2. Enable debug mode for detailed logs
3. Verify all configuration values
4. Ensure all prerequisites are installed
5. Check Discord and Minecraft server permissions
6. If all else fails, shoot me an email at shadowplays545@gmail.com and I'll get in touch with you.

## License

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
