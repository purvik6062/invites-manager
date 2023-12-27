const {
    Client,
    REST,
    IntentsBitField,
    GatewayIntentBits,
    Events,
    Partials,
} = require("discord.js");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});
require('dotenv').config();
const { Routes } = require('discord-api-types/v9');
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;


const sqlite3 = require('sqlite3');

// const InvitesTracker = require('@androz2091/discord-invites-tracker');
// const tracker = InvitesTracker.init(client, {
//     fetchGuilds: true,
//     fetchVanity: true,
//     fetchAuditLogs: true
// });

var { inviteTracker } = require("discord-inviter"),
    tracker = new inviteTracker(client);

const db = new sqlite3.Database('discordBotData.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Database opened');
        await initialize();
    }
});


async function createTables() {
    return new Promise((resolve, reject) => {
        db.run(`
CREATE TABLE IF NOT EXISTS userData (
  member_user_id TEXT,
  inviter_user_id TEXT,
  member_joinedTimestamp TEXT
)
`, (err) => {
            if (err) {
                reject(err);
            } else {
                console.log('userData table created');
                resolve();
            }

        })
    });
}

client.once('ready', () => {
    console.log('Bot is ready!');
    console.log(`Logged in as ${client.user.tag}`);
    // checkInvitesForAllMembers();
});

const commands = [
    {
        name: 'count',
        description: 'Initiate the verification process.',
    },
    {
        name: 'getrole',
        description: 'Get a role.',
    },
];


const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();


client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;



    if (commandName === 'count') {
        console.log("interaction.channelId", interaction.channelId);
        console.log("process.env.INVITE_AMB_CHANNEL_ID", process.env.INVITE_AMB_CHANNEL_ID);

        // const ranks = await client.cache.ranks.get(process.env.GUILD_ID);
        // console.log(ranks)

        if (interaction.channelId === process.env.INVITE_AMB_CHANNEL_ID) {
            await getInviteCount(interaction);
        } else {
            const inviteAmbChannel = client.channels.cache.get(process.env.INVITE_AMB_CHANNEL_ID);
            // console.log("inviteAmbChannel", inviteAmbChannel)
            if (inviteAmbChannel) {
                interaction.reply(`This command can only be used in the ${inviteAmbChannel.toString()} channel.`);
            } else {
                interaction.reply('This command can only be used in the #invite-amb channel.');
            }
        }
    } else if (commandName === 'getrole') {
        if (interaction.channelId === process.env.INVITE_AMB_CHANNEL_ID) {
            await assignRoleIfEnoughInvites(interaction);
        } else {
            const inviteAmbChannel = client.channels.cache.get(process.env.INVITE_AMB_CHANNEL_ID);
            if (inviteAmbChannel) {
                interaction.reply(`This command can only be used in the ${inviteAmbChannel.toString()} channel.`);
            } else {
                interaction.reply('This command can only be used in the #invite-amb channel.');
            }
        }
    }
});

async function getUniqueInvitedMembers(userId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT COUNT(DISTINCT member_user_id) AS uniqueInviteCount, GROUP_CONCAT(DISTINCT member_user_id) AS uniqueMemberIds FROM userData WHERE inviter_user_id = ?`;

        db.get(query, [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                const result = {
                    uniqueInviteCount: row ? row.uniqueInviteCount : 0,
                    uniqueMemberIds: row ? (row.uniqueMemberIds || '').split(',') : [],
                };
                resolve(result);
            }
        });
    });
}

async function checkRegularMembers(uniqueMemberIds) {
    const results = [];

    const guild = client.guilds.cache.get(process.env.GUILD_ID);

    if (guild) {
        await guild.members.fetch();

        for (const memberId of uniqueMemberIds) {
            const member = guild.members.cache.get(memberId);

            if (member) {
                results.push({
                    memberId,
                    isRegular: true,
                });
            } else {
                results.push({
                    memberId,
                    isRegular: false,
                });
            }
        }
    }

    return results;
}

async function getInviteCount(interaction) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const invites = await interaction.guild.invites.fetch();

    let totalInviteCount = 0;

    invites.forEach((invite) => {
        if (invite.inviter && invite.inviter.id === interaction.user.id) {
            totalInviteCount += invite.uses;
        }
    });

    const userId = interaction.user.id;

    const { uniqueInviteCount, uniqueMemberIds } = await getUniqueInvitedMembers(userId);

    console.log(uniqueMemberIds)

    const result = await checkRegularMembers(uniqueMemberIds);
    console.log(result)

    interaction.reply(`You have invited ${uniqueInviteCount} member(s).`);
    // interaction.reply(`You have a total of ${totalInviteCount} invite(s).`);
}


async function assignRoleIfEnoughInvites(interaction) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const invites = await interaction.guild.invites.fetch();

    let totalInviteCount = 0;

    invites.forEach((invite) => {
        if (invite.inviter && invite.inviter.id === interaction.user.id) {
            totalInviteCount += invite.uses;
        }
    });

    const userId = interaction.user.id;

    const { uniqueInviteCount, uniqueMemberIds } = await getUniqueInvitedMembers(userId);

    if (uniqueInviteCount >= 10) {
        const roleId = process.env.MAESTRO;
        const role = interaction.guild.roles.cache.get(roleId);

        if (role) {
            member.roles.add(role);
            interaction.reply("Congratulations! You've been given the MAESTRO role for inviting 10 or more members.");
            member.send("Congratulations! You've been given the MAESTRO role for inviting 10 or more members.");
        } else {
            interaction.reply('Error: Role not found.');
        }
    } else if (uniqueInviteCount >= 5) {
        const roleId = process.env.DYNAMO;
        const role = interaction.guild.roles.cache.get(roleId);

        if (role) {
            member.roles.add(role);
            interaction.reply("Congratulations! You've been given the DYNAMO role for inviting 5 or more members.");
            member.send("Congratulations! You've been given the DYNAMO role for inviting 5 or more members.");
        } else {
            interaction.reply('Error: Role not found.');
        }
    } else if (uniqueInviteCount >= 1) {
        const roleId = process.env.TRAILBLAZER;
        const role = interaction.guild.roles.cache.get(roleId);

        if (role) {
            member.roles.add(role);
            interaction.reply("Congratulations! You've been given the TRAILBLAZER role for inviting at least 1 member.");
            member.send("Congratulations! You've been given the TRAILBLAZER role for inviting at least 1 member.");
        } else {
            interaction.reply('Error: Role not found.');
        }
    } else {
        interaction.reply(`You need at least 1 invite to get the first TRAILBLAZER role.`);
    }
}


// tracker.on('guildMemberAdd', (member, type, invite) => {

//     const welcomeChannel = member.guild.channels.cache.find((ch) => ch.name === 'general');

//     if (type === 'normal') {
//         welcomeChannel.send(`Welcome ${member}! You were invited by ${invite.inviter.username}!`);
//     }

//     else if (type === 'vanity') {
//         welcomeChannel.send(`Welcome ${member}! You joined using a custom invite!`);
//     }

//     else if (type === 'permissions') {
//         welcomeChannel.send(`Welcome ${member}! I can't figure out how you joined because I don't have the "Manage Server" permission!`);
//     }

//     else if (type === 'unknown') {
//         welcomeChannel.send(`Welcome ${member}! I can't figure out how you joined the server...`);
//     }

// });

tracker.on("guildMemberAdd", async (member, inviter, invite, error) => {
    // return when get error
    if (error) return console.error(error);

    // Log member user ID and inviter user ID and timestamp
    console.log(`Member User ID: ${member.user.id}, Inviter User ID: ${inviter.id}, member.joinTimestamp: ${member.joinTimestamp}`);

    // Insert data into the userData table
    const joinTimestamp = member.joinedTimestamp.toString(); // Convert timestamp to string if needed
    db.run(`
        INSERT INTO userData VALUES (?, ?, ?)
    `, [member.user.id, inviter.id, member.joinTimestamp], (err) => {
        if (err) {
            console.error('Error inserting data into userData table:', err.message);
        } else {
            console.log('Data inserted into userData table');
        }
    });

    // get the channel
    let channel = member.guild.channels.cache.get(process.env.INVITE_AMB_CHANNEL_ID),
        Msg = `Welcome ${member.user}, invited by <@!${inviter.id}>`;

    // change welcome message when the member is bot
    if (member.user.bot)
        Msg = `Welcome ${member.user}, invited by <@!${inviter.id}>`;

    // send welcome message
    channel.send(Msg);
});


// "error" event to get any error
tracker.on("error", (guild, err) => {
    console.error(guild?.name, err);
});

// client.on("messageCreate", async (message) => {
//     // get member invites count
//     if (message.content == "invites") {
//         var invite = await inviteTracker.getMemberInvites(message.member);
//         message.channel.send(
//             `${message.author.tag} has ${invite.count} invite(s).`
//         );
//         // get server top invites
//     } else if (message.content == "top-invites") {
//         var top = await inviteTracker.getTopInvites(message.guild);
//         message.channel.send(
//             top
//                 .map((i, n) => `\`#${n + 1}\`- **${i.user.tag}** has __${i.count}__`)
//                 .join("\n")
//         );
//         // get info of any invite code
//     } else if (message.content == "invite-info") {
//         var invite = await inviteTracker.getInfo(client, "https://discord.gg/maxSPHjvaw");
//         if (!invite) return;

//         message.channel.send(
//             `Guild: ${invite.guild.name},\nInviter: ${invite?.inviter ? `${invite.inviter.tag}` : "Owner"
//             },\nLink: ${invite.url}`
//         );
//     }
// });



async function initialize() {
    try {
        await createTables();
    } catch (error) {
        console.error('Initialization error:', error);
    }
}


client.login(process.env.TOKEN);
