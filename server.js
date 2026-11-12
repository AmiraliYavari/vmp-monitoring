
on('playerJoining', () => {

    const playerId = global.source;

    const playerName = GetPlayerName(playerId);

    console.log(`[monitoring] ${playerName} ba id ${playerId} be server join dad`);
});

on('playerConnecting', (playerName, setKickReason, deferrals) => {

    const playerId = global.source;

    console.log(`[monitoring] ${playerName} ba id ${playerId} darhal etesal be server ast`);
});


on('playerDropped', (reason, resourceName, clientDropReason) => {

    const playerId = global.source;
    const playerName = GetPlayerName(playerId)
    console.log(`[monitoring] ${playerName} drop shod, reason: ${reason}, resource: ${resourceName}, clientDropReason: ${clientDropReason}`)
})

function sendDiscordLog(title, description) {
    
}