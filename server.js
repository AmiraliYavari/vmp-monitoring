
on('playerJoining', () => {

    const playerId = global.source;

    const playerName = GetPlayerName(playerId);

    console.log(`[monitoring] ${playerName} ba id ${playerId} be server join dad`);
});

on('playerConnecting', () => {

    const playerId = global.source;

    const playerName = GetPlayerName(playerId);

    console.log(`[monitoring] ${playerName} ba id ${playerId} darhal etesal be server ast`);
});


on('playerDropped', (reason, resourceName, clientDropReason) => {
    console.log(`Player ${GetPlayerName(global.source)} drop shod, reason: ${reason}, resource: ${resourceName}, clientDropReason: ${clientDropReason}`)
})

