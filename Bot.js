const fs = require('fs');
const ini = require('ini');
const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
const { Client, GatewayIntentBits, Partials, Events, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, InteractionResponseFlags } = require("discord.js");const { spawn, exec } = require("child_process");
const Rcon = require("rcon");


const TOKEN = config.discord.token;
const GUILD_ID = config.discord.guild_id;
const CLIENT_ID = config.discord.client_id;
const CHANNEL_ID = config.discord.channel_id;
const NOTIFY_ID = config.discord.notify_id;

// RCON Config

const RCON_HOST = config.rcon.host;
const RCON_PORT = parseInt(config.rcon.port);
const RCON_PASSWORD = config.rcon.password;

const DEBUG = DEBUG_MODE = config.general.debug_mode;

console.log('Debug mode is:', config.general.debug_mode);
if (DEBUG)
  console.log('Config loaded:', config);  // !!IMPORTANT!! THIS WILL LOAD THE ENTIRE CONTENT OF THE config.ini FILE INTO THE CONSOLE.
                                        // THAT MEANS IT WILL ALSO PRINT YOUR BOT TOKEN IN PLAIN TEXT INO THE CONSOLE
                                        // MALICIOUS ACTORS CAN COMPROMISE YOUR BOT WITH THIS TOKEN. DON'T SHOW THE CONSOLE, OR WHERERVER YOU RAN THIS SCRIPT IN A STREAM/VIDEO
                                        // ALTERNATIVELY DELET THIS LINE, IT'S ONLY THERE TO SHOW YOU WHAT IT LOADED OR TRIED TO LOAD

// Server Config

const SERVER_CONFIG = {
  vanilla: {
    jar: config.minecraft.vanilla_jar,
    dir: config.minecraft.vanilla_dir
  },
  modded: {
    jar: config.minecraft.modded_jar,
    dir: config.minecraft.modded_dir
  }
};

let mcProc = null, playitProc = null, shutdownTimer = null, lastActivity = Date.now();

// Punishment History Storage (in-memory)
const punishmentHistory = new Map(); // userId -> array of punishments

// Helper function to add punishment to history
function addPunishment(userId, type, reason, moderator, duration = null) {
  if (!punishmentHistory.has(userId)) {
    punishmentHistory.set(userId, []);
  }
  
  const punishment = {
    type: type,
    reason: reason,
    moderator: moderator,
    timestamp: Date.now(),
    duration: duration
  };
  
  punishmentHistory.get(userId).push(punishment);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

// Helper Functions
const log = (msg) => DEBUG_MODE && console.log(`[DEBUG] ${msg}`);
const hasRole = (member, roleName) => member.roles.cache.some(r => r.name === roleName);
const hasPerm = (member, perm) => member.permissions.has(perm);
const notify = (msg) => client.channels.fetch(NOTIFY_ID).then(ch => ch.send(msg)).catch(console.error);

// Check if user has any moderation permissions
const hasModerationAccess = (member) => {
  return hasPerm(member, 'ManageMessages') || 
         hasPerm(member, 'BanMembers') || 
         hasPerm(member, 'KickMembers') || 
         hasPerm(member, 'ModerateMembers') ||
         hasRole(member, 'RCON Access');
};

// Server Management Functions
function launchServer(mode) {
  const config = SERVER_CONFIG[mode];
  const memory = config.MC_MAX_MEMORY || "12288M"; // Change this value: "12288M" To the one you set in the config.ini
  const args = [`-Xmx${memory}`, `-Xms${memory}`, "-jar", config.jar];
  

  // Logs console output of server for automated shutdown after three minutes of inactivity. (Hopefully works. Not necessary, you can delte that function - Lines 84 - 126 + 148 - 190.)
  log(`Launching ${mode} server: ${args.join(' ')}`);
  mcProc = spawn("java", args, { cwd: config.dir, detached: true });

  mcProc.stdout.on("data", (data) => {
    const output = data.toString().trim();
    console.log(`[Minecraft] ${output}`);

    lastActivity = Date.now();

    if (output.includes("Server empty for 60 seconds, pausing")) {
      log("Server idle detected from logs");
      scheduleShutdown("Server reported as idle");
    }

    if (output.includes("joined the game") || 
        output.includes("left the game") || 
        output.includes("Running tick loop") ||
        output.includes("<") || 
        output.includes("issued server command")) {
      cancelShutdown();
    }
  });

  mcProc.stderr.on("data", (data) => console.error(`[MC Error] ${data}`));
  mcProc.on("exit", (code) => {
    console.log(`[MC Exit] Code: ${code}`);
    mcProc = null;
    cancelShutdown();
  });

  playitProc = spawn("C:\\Program Files\\playit_gg\\bin\\playit.exe", [], { detached: true });
  console.log("[Start] Server launched");
  
  startActivityMonitor();
}


// Stops the server if it is running
function stopServer(interaction) {
  exec("taskkill /F /IM java.exe /T", (err) => 
    interaction.reply(err ? "⚠️ Could not stop server." : "✅ Server stopped."));
  
  if (playitProc) {
    try {
      process.kill(-playitProc.pid);
      playitProc = null;
    } catch {}
  }
  
  // part of the timed shutdown. If you delete the automatic shutdown this will have no purpose.
  cancelShutdown();
}


// Also part of the Automatic Shutdown
function scheduleShutdown(reason) {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  
  console.log(`[Monitor] ${reason}. Shutdown in 3 minutes...`);
  
  shutdownTimer = setTimeout(() => {
    if (mcProc) {
      try {
        process.kill(-mcProc.pid);
        mcProc = null;
        console.log("[Monitor] Server shut down due to inactivity");
        notify("⚠️ Server shut down automatically due to inactivity.");
      } catch (err) {
        console.error("[Monitor] Shutdown error:", err);
      }
    }
    cancelShutdown();
  }, 180000);
}

function cancelShutdown() {
  if (shutdownTimer) {
    console.log("[Monitor] Activity detected. Canceling shutdown.");
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
}

function startActivityMonitor() {
  const monitor = setInterval(() => {
    if (!mcProc) {
      clearInterval(monitor);
      return;
    }
    
    const inactiveTime = Date.now() - lastActivity;
    const threeMinutes = 180000;
    
    if (inactiveTime >= threeMinutes && !shutdownTimer) {
      scheduleShutdown(`No activity for ${Math.floor(inactiveTime / 60000)} minutes`);
    }
  }, 30000);
}


// Sends RCON Commands
function sendRcon(cmd, interaction, prefix = "✅ Command sent.") {
  const rcon = new Rcon(config.rcon.host, config.rcon.port, config.rcon.password);
  rcon.on("auth", () => rcon.send(cmd))
    .on("response", (res) => {
      rcon.disconnect();
      interaction.reply(`${prefix} Server: \`\`\`${res}\`\`\``);
    })
    .on("error", (err) => interaction.reply(`❌ RCON failed: ${err.message}`))
    .connect();
}

// Slash Command Definitions
const commands = [
  new SlashCommandBuilder()
    .setName('startserver')
    .setDescription('Start the Minecraft server')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Server mode')
        .setRequired(false)
        .addChoices(
          { name: 'Modded', value: 'modded' },
          { name: 'Vanilla', value: 'vanilla' }
        )),

  new SlashCommandBuilder()
    .setName('stopserver')
    .setDescription('Stop the Minecraft server'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check server status')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('rcon')
    .setDescription('Send RCON command to server')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('RCON command to execute')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send message to server chat')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Message to send')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages from channel')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for ban')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for kick')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to timeout')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 10m, 1h, 2d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for timeout')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to remove timeout from')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for removing timeout')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for warning')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to get info about')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('punishments')
    .setDescription('View punishment history for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check punishments for')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('clearhistory')
    .setDescription('Clear punishment history for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to clear history for')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
];

// Command Handlers
const commandHandlers = {
  async startserver(interaction) {
    const mode = interaction.options.getString('mode') || 'modded';
    
    await interaction.reply(`🚀 Starting **${mode}** server...`);
    launchServer(mode);
    setTimeout(() => interaction.followUp(`✅ **${mode}** server is live!\n🌐IP: \`21.ip.gl.ply.gg:58741\``), 12000);
  },

  stopserver: (interaction) => stopServer(interaction),

  async status(interaction) {
    if (!hasModerationAccess(interaction.member)) 
      return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
    
    await interaction.reply(`Server: ${mcProc ? "🟢 Running" : "🔴 Stopped"}`);
  },

  async rcon(interaction) {
    if (!hasRole(interaction.member, "RCON Access")) 
      return interaction.reply({ content: "❌ Need 'RCON Access' role.", ephemeral: true });
    
    const command = interaction.options.getString('command');
    if (!mcProc) return interaction.reply({ content: "❌ Server not running!", ephemeral: true });
    
    sendRcon(command, interaction);
  },

  async say(interaction) {
    if (!hasRole(interaction.member, "RCON Access")) 
      return interaction.reply({ content: "❌ Need 'RCON Access' role.", ephemeral: true });
    
    const message = interaction.options.getString('message');
    if (!mcProc) return interaction.reply({ content: "❌ Server not running!", ephemeral: true });
    
    sendRcon(`say ${message}`, interaction, "📢 Message sent.");
  },

  async purge(interaction) {
    if (!hasPerm(interaction.member, 'ManageMessages')) 
      return interaction.reply({ content: "❌ Need Manage Messages permission.", ephemeral: true });
    
    const amount = interaction.options.getInteger('amount');

    try {
      await interaction.deferReply({ ephemeral: true });
      
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      const recent = messages.filter(m => m.createdTimestamp > Date.now() - 1209600000);
      
      if (recent.size === 0) return interaction.editReply("❌ No deletable messages found.");
      
      await interaction.channel.bulkDelete(recent, false);
      const deleted = recent.size;
      
      await interaction.editReply(`🗑️ Deleted ${deleted} message${deleted !== 1 ? 's' : ''}.`);
    } catch (err) {
      console.error("[Purge Error]", err);
      await interaction.editReply("❌ Failed to purge messages.");
    }
  },

  async ban(interaction) {
    if (!hasPerm(interaction.member, 'BanMembers')) 
      return interaction.reply({ content: "❌ Need Ban Members permission.", ephemeral: true });
    
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || "No reason";

    try {
      const member = interaction.guild.members.cache.get(user.id);
      
      if (member && (!member.bannable || interaction.member.roles.highest.position <= member.roles.highest.position))
        return interaction.reply({ content: "❌ Cannot ban this user.", ephemeral: true });

      await interaction.guild.members.ban(user, { reason: `By ${interaction.user.tag}: ${reason}` });
      await interaction.reply(`🔨 **${user.tag}** banned.\n**Reason:** ${reason}`);
      notify(`🔨 ${user.tag} banned by ${interaction.user.tag}: ${reason}`);
      
      addPunishment(user.id, 'Ban', reason, interaction.user.tag);
    } catch (err) {
      await interaction.reply({ content: "❌ Failed to ban user.", ephemeral: true });
    }
  },

  async kick(interaction) {
    if (!hasPerm(interaction.member, 'KickMembers')) 
      return interaction.reply({ content: "❌ Need Kick Members permission.", ephemeral: true });
    
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || "No reason";

    try {
      const member = interaction.guild.members.cache.get(user.id);
      
      if (!member) return interaction.reply({ content: "❌ User not in server.", ephemeral: true });
      if (!member.kickable || interaction.member.roles.highest.position <= member.roles.highest.position)
        return interaction.reply({ content: "❌ Cannot kick this user.", ephemeral: true });

      await member.kick(`By ${interaction.user.tag}: ${reason}`);
      await interaction.reply(`👢 **${user.tag}** kicked.\n**Reason:** ${reason}`);
      notify(`👢 ${user.tag} kicked by ${interaction.user.tag}: ${reason}`);
      
      addPunishment(user.id, 'Kick', reason, interaction.user.tag);
    } catch (err) {
      await interaction.reply({ content: "❌ Failed to kick user.", ephemeral: true });
    }
  },

  async timeout(interaction) {
    if (!hasPerm(interaction.member, 'ModerateMembers')) 
      return interaction.reply({ content: "❌ Need Moderate Members permission.", ephemeral: true });
    
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || "No reason";

    try {
      const member = interaction.guild.members.cache.get(user.id);
      
      if (!member) return interaction.reply({ content: "❌ User not in server.", ephemeral: true });
      if (!member.moderatable || interaction.member.roles.highest.position <= member.roles.highest.position)
        return interaction.reply({ content: "❌ Cannot timeout this user.", ephemeral: true });

      const timeMatch = duration.match(/^(\d+)([smhd])$/i);
      if (!timeMatch) return interaction.reply({ content: "❌ Invalid duration: use `10m`, `1h`, `2d`", ephemeral: true });

      const [, value, unit] = timeMatch;
      const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      const ms = parseInt(value) * multipliers[unit.toLowerCase()];
      
      if (ms > 2419200000) return interaction.reply({ content: "❌ Max 28 days.", ephemeral: true });

      await member.timeout(ms, `By ${interaction.user.tag}: ${reason}`);
      await interaction.reply(`🔇 **${user.tag}** timed out for **${duration}**.\n**Reason:** ${reason}`);
      notify(`🔇 ${user.tag} timed out by ${interaction.user.tag} for ${duration}: ${reason}`);
      
      addPunishment(user.id, 'Timeout', reason, interaction.user.tag, duration);
    } catch (err) {
      await interaction.reply({ content: "❌ Failed to timeout user.", ephemeral: true });
    }
  },

  async untimeout(interaction) {
    if (!hasPerm(interaction.member, 'ModerateMembers')) 
      return interaction.reply({ content: "❌ Need Moderate Members permission.", ephemeral: true });
    
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || "No reason";

    try {
      const member = interaction.guild.members.cache.get(user.id);
      
      if (!member) return interaction.reply({ content: "❌ User not in server.", ephemeral: true });
      if (!member.communicationDisabledUntil) return interaction.reply({ content: "❌ User not timed out.", ephemeral: true });

      await member.timeout(null, `By ${interaction.user.tag}: ${reason}`);
      await interaction.reply(`🔊 **${user.tag}** timeout removed.\n**Reason:** ${reason}`);
      notify(`🔊 ${user.tag} timeout removed by ${interaction.user.tag}: ${reason}`);
    } catch (err) {
      await interaction.reply({ content: "❌ Failed to remove timeout.", ephemeral: true });
    }
  },

  async warn(interaction) {
    if (!hasPerm(interaction.member, 'ManageMessages')) 
      return interaction.reply({ content: "❌ Need Manage Messages permission.", ephemeral: true });
    
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    try {
      await interaction.reply(`⚠️ **${user.tag}** warned.\n**Reason:** ${reason}\n**By:** ${interaction.user.tag}`);
      
      try {
        await user.send(`⚠️ **Warned in ${interaction.guild.name}**\n**Reason:** ${reason}\n**By:** ${interaction.user.tag}`);
      } catch {
        await interaction.followUp({ content: `📪 Could not DM ${user.tag}.`, ephemeral: true });
      }
      
      notify(`⚠️ ${user.tag} warned by ${interaction.user.tag}: ${reason}`);
      addPunishment(user.id, 'Warning', reason, interaction.user.tag);
    } catch (err) {
      await interaction.reply({ content: "❌ Failed to warn user.", ephemeral: true });
    }
  },

  async userinfo(interaction) {
    if (!hasModerationAccess(interaction.member)) 
      return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });

    try {
      const user = interaction.options.getUser('user') || interaction.user;
      const member = interaction.guild.members.cache.get(user.id);

      const joined = member ? member.joinedAt.toLocaleDateString() : 'Not in server';
      const created = user.createdAt.toLocaleDateString();
      const roles = member ? 
        member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || 'None' : 
        'Not in server';
      
      const timedOut = member?.communicationDisabledUntil && new Date(member.communicationDisabledUntil) > new Date();
      
      let info = `**${user.tag}**\n**ID:** ${user.id}\n**Created:** ${created}\n**Joined:** ${joined}\n**Roles:** ${roles}`;
      if (timedOut) info += `\n**⚠️ Timed out until:** ${new Date(member.communicationDisabledUntil).toLocaleString()}`;
      
      await interaction.reply(info);
    } catch (err) {
      await interaction.reply({ content: "❌ Failed to get user info.", ephemeral: true });
    }
  },

  async punishments(interaction) {
    if (!hasModerationAccess(interaction.member)) 
      return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });

    const user = interaction.options.getUser('user');

    try {
      const userPunishments = punishmentHistory.get(user.id) || [];

      if (userPunishments.length === 0) {
        return interaction.reply(`📋 **${user.tag}** has no punishment history.`);
      }

      const sortedPunishments = userPunishments.sort((a, b) => b.timestamp - a.timestamp);
      const recentPunishments = sortedPunishments.slice(0, 10);
      
      let punishmentList = `📋 **Punishment History for ${user.tag}**\n`;
      punishmentList += `**Total Punishments:** ${userPunishments.length}\n\n`;

      recentPunishments.forEach((punishment, index) => {
        const date = new Date(punishment.timestamp).toLocaleDateString();
        const time = new Date(punishment.timestamp).toLocaleTimeString();
        const duration = punishment.duration ? ` (${punishment.duration})` : '';
        
        punishmentList += `**${index + 1}.** ${punishment.type}${duration}\n`;
        punishmentList += `**Reason:** ${punishment.reason}\n`;
        punishmentList += `**By:** ${punishment.moderator}\n`;
        punishmentList += `**Date:** ${date} at ${time}\n\n`;
      });

      if (userPunishments.length > 10) {
        punishmentList += `*Showing 10 most recent punishments out of ${userPunishments.length} total.*`;
      }

      if (punishmentList.length > 2000) {
        const firstPart = punishmentList.substring(0, 1900) + "\n\n*Message truncated - too many punishments to display.*";
        await interaction.reply(firstPart);
      } else {
        await interaction.reply(punishmentList);
      }
    } catch (err) {
      console.error("[Punishments Error]", err);
      await interaction.reply({ content: "❌ Failed to get user punishment history.", ephemeral: true });
    }
  },

  async clearhistory(interaction) {
    if (!hasPerm(interaction.member, 'Administrator')) 
      return interaction.reply({ content: "❌ Need Administrator permission to clear punishment history.", ephemeral: true });

    const user = interaction.options.getUser('user');

    try {
      const userPunishments = punishmentHistory.get(user.id) || [];
      
      if (userPunishments.length === 0) {
        return interaction.reply(`📋 **${user.tag}** has no punishment history to clear.`);
      }

      punishmentHistory.delete(user.id);
      await interaction.reply(`🗑️ Cleared punishment history for **${user.tag}** (${userPunishments.length} punishment${userPunishments.length !== 1 ? 's' : ''} removed).`);
      notify(`🗑️ ${interaction.user.tag} cleared punishment history for ${user.tag}`);
    } catch (err) {
      console.error("[Clear History Error]", err);
      await interaction.reply({ content: "❌ Failed to clear punishment history.", ephemeral: true });
    }
  },

  async ping(interaction) {
  if (!hasModerationAccess(interaction.member)) 
    return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
  const start = Date.now();
  await interaction.reply("🏓 Pinging...");
  const responseTime = Date.now() - start;
  await interaction.editReply(`🏓 Pong! Response: ${responseTime}ms | WebSocket: ${Math.round(client.ws.ping)}ms`);
}
};

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('[Discord] Started refreshing application (/) commands.');
    
    // Use CLIENT_ID from ini, or fallback to client.user.id if available
    const applicationId = CLIENT_ID || client.user.id;
   
    if (!applicationId) {
      console.error('[Discord] No CLIENT_ID found in environment variables and client not ready yet.');
      return;
    }

    // CLEAR EXISTING COMMANDS FIRST
    console.log('[Discord] Clearing existing commands...');
    
    if (GUILD_ID) {
      // Clear guild commands
      await rest.put(
        Routes.applicationGuildCommands(applicationId, GUILD_ID),
        { body: [] }
      );
      console.log('[Discord] Cleared existing guild commands.');
      
      // Register new guild commands
      await rest.put(
        Routes.applicationGuildCommands(applicationId, GUILD_ID),
        { body: commands }
      );
      console.log('[Discord] Successfully reloaded guild application (/) commands.');
    } else {
      // Clear global commands
      await rest.put(
        Routes.applicationCommands(applicationId),
        { body: [] }
      );
      console.log('[Discord] Cleared existing global commands.');
      
      // Register new global commands
      await rest.put(
        Routes.applicationCommands(applicationId),
        { body: commands }
      );
      console.log('[Discord] Successfully reloaded global application (/) commands.');
    }

    // Also clear global commands if we're using guild commands (to prevent duplicates)
    if (GUILD_ID) {
      try {
        await rest.put(Routes.applicationCommands(applicationId), { body: [] });
        console.log('[Discord] Also cleared any existing global commands.');
      } catch (error) {
        // This might fail if there are no global commands, which is fine
        console.log('[Discord] No global commands to clear (this is normal).');
      }
    }

  } catch (error) {
    console.error('[Discord] Error registering commands:', error);
  }
}

// Interaction Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  
  log(`Slash Command: ${commandName}`);

  try {
    if (commandHandlers[commandName]) {
      await commandHandlers[commandName](interaction);
    } else {
      await interaction.reply({ content: `❌ Unknown command: \`${commandName}\``, ephemeral: true });
    }
  } catch (err) {
    console.error(`[Command Error] ${commandName}:`, err);
    const errorMessage = "❌ Command error occurred.";
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

// Bot Ready
client.once(Events.ClientReady, async () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  
  // Register slash commands
  await registerCommands();
  
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    console.log(`[Discord] Channel "${channel.name}" ready.`);
    if (DEBUG_MODE) channel.send("🤖 Bot online with slash commands!");
  } catch (err) {
    console.error("[Discord] Channel error:", err);
  }
});

// Error Handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);

client.login(TOKEN);
