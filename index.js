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

        if (interaction.channelId === process.env.INVITE_AMB_CHANNEL_ID) {
            await getInviteCount(interaction);
        } else {
            const inviteAmbChannel = client.channels.cache.get(process.env.INVITE_AMB_CHANNEL_ID);
            console.log("inviteAmbChannel", inviteAmbChannel)
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

// async function assignRoleIfEnoughInvites(interaction) {
//     const member = interaction.guild.members.cache.get(interaction.user.id);
//     const invites = await interaction.guild.invites.fetch();

//     let totalInviteCount = 0;

//     invites.forEach((invite) => {
//         if (invite.inviter && invite.inviter.id === interaction.user.id) {
//             totalInviteCount += invite.uses;
//         }
//     });

//     const userId = interaction.user.id;

//     const { uniqueInviteCount, uniqueMemberIds } = await getUniqueInvitedMembers(userId);

//     if (uniqueInviteCount >= 5) {
//         // Replace 'ROLE_ID_HERE' with the actual ID of the role you want to assign
//         const roleId = process.env.DYNAMO;
//         const role = interaction.guild.roles.cache.get(roleId);

//         if (role) {
//             member.roles.add(role);
//             interaction.reply("Congratulations! You've been given the role.");
//             member.send("Congratulations! You've been given the role for inviting 5 or more members.");
//         } else {
//             interaction.reply('Error: Role not found.');
//         }
//     } else {
//         interaction.reply(`You need at least 5 invites to get the role.`);
//     }
// }

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
        interaction.reply(`You need at least 1 invite to get the first role.`);
    }
}




// async function checkInvitesForAllMembers() {
//     const guild = client.guilds.cache.get(process.env.GUILD_ID);

//     if (guild) {
//         await guild.members.fetch();

//         guild.members.cache.forEach(async (member) => {
//             await assignRoleIfEnoughInvitesOnJoin(member);
//         });
//     }
// }

// async function assignRoleIfEnoughInvitesOnJoin(member) {
//     const invites = await member.guild.invites.fetch();

//     let totalInviteCount = 0;

//     invites.forEach((invite) => {
//         if (invite.inviter && invite.inviter.id === interaction.user.id) {
//             totalInviteCount += invite.uses;
//         }
//     });

//     if (totalInviteCount >= 5) {
//         // Replace 'ROLE_ID_HERE' with the actual ID of the role you want to assign
//         const roleId = process.env.DYNAMO;
//         const role = member.guild.roles.cache.get(roleId);

//         if (role) {
//             member.roles.add(role);
//             member.send("Congratulations! You've been given the role for inviting 5 or more members.");
//         } else {
//             console.error('Error: Role not found.');
//         }
//     }
// }


client.on('guildMemberAdd', async (member) => {

    const guild = member.guild;
    const auditLogs = await guild.fetchAuditLogs({ type: 28 }); // Use the integer value for GUILD_MEMBER_ADD

    const memberAddEntry = auditLogs.entries.first();

    if (memberAddEntry) {
        const { executor, target } = memberAddEntry;

        const logChannel = guild.channels.cache.get(process.env.INVITE_AMB_CHANNEL_ID);

        if (logChannel) {

            const dataInsertSql = `INSERT INTO userData VALUES (?, ?, ?)`;

            db.run(dataInsertSql, [
                member.user.id,
                executor.id,
                member.joinedAt,
            ]);

            const joinedAt = member.joinedAt;
            const localTime = joinedAt.toLocaleString();
            logChannel.send(`Member: ${member.user.tag} has joined. Invited by: ${executor.tag}.`);
            // logChannel.send(`Member: ${member.user.tag} (${member.displayName}) (${member.user.id}) has joined. Invited by: ${executor.tag} (${executor.id}). Joined at: ${localTime}`);
        } else {
            console.error('Error: Log channel not found.');
        }
    }
});


async function initialize() {
    try {
        await createTables();
    } catch (error) {
        console.error('Initialization error:', error);
    }
}


client.login(process.env.TOKEN);
