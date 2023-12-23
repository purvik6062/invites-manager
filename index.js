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
        console.log("process.env.INVITE_AMB_ROLE_ID", process.env.INVITE_AMB_CHANNEL_ID);

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

async function getInviteCount(interaction) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const invites = await interaction.guild.invites.fetch();

    let totalInviteCount = 0;

    invites.forEach((invite) => {
        if (invite.inviter && invite.inviter.id === interaction.user.id) {
            totalInviteCount += invite.uses;
        }
    });

    interaction.reply(`You have a total of ${totalInviteCount} invite(s).`);
}

async function assignRoleIfEnoughInvites(interaction) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const invites = await interaction.guild.invites.fetch();

    let totalInviteCount = 0;

    invites.forEach((invite) => {
        if (invite.inviter && invite.inviterID === interaction.user.id) {
            totalInviteCount += invite.uses;
        }
    });

    if (totalInviteCount >= 5) {
        // Replace 'ROLE_ID_HERE' with the actual ID of the role you want to assign
        const roleId = process.env.INVITE_AMB_ROLE_ID;
        const role = interaction.guild.roles.cache.get(roleId);

        if (role) {
            member.roles.add(role);
            interaction.reply("Congratulations! You've been given the role.");
            member.send("Congratulations! You've been given the role for inviting 5 or more members.");
        } else {
            interaction.reply('Error: Role not found.');
        }
    } else {
        interaction.reply(`You need at least 5 invites (total: ${totalInviteCount}) to get the role.`);
    }
}



async function checkInvitesForAllMembers() {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);

    if (guild) {
        await guild.members.fetch();

        guild.members.cache.forEach(async (member) => {
            await assignRoleIfEnoughInvitesOnJoin(member);
        });
    }
}

async function assignRoleIfEnoughInvitesOnJoin(member) {
    const invites = await member.guild.invites.fetch();

    // Assuming you have only one invite link for simplicity
    const userInvites = invites.find((invite) => invite.inviter && invite.inviter.id === member.user.id);

    if (userInvites && userInvites.uses >= 5) {
        // Replace 'ROLE_ID_HERE' with the actual ID of the role you want to assign
        const roleId = process.env.INVITE_AMB_ROLE_ID;
        const role = member.guild.roles.cache.get(roleId);

        if (role) {
            member.roles.add(role);
            member.send("Congratulations! You've been given the role for inviting 5 or more members.");
        } else {
            console.error('Error: Role not found.');
        }
    }
}


client.login(process.env.TOKEN);
