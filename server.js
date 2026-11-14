'use strict';

/*
    VMP Monitoring
    Author : AmirVentus
    https://amiraliyavari.top/

    Webhook URL ha az tarighe convar (server.cfg) set mishan, dakhel code nazar:

        set monitoring_webhook "https://discord.com/api/webhooks/..."

    Optional (har category webhook joda, agar set nashe default estefade mishe):

        set monitoring_webhook_connections ""
        set monitoring_webhook_chat        ""
        set monitoring_webhook_deaths      ""
        set monitoring_webhook_resources   ""
        set monitoring_webhook_admin       ""
        set monitoring_webhook_system      ""
*/

const https = require('https');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const CONFIG = {
    serverTag: 'VMP',
    timezone: 'Asia/Tehran',
    botName: 'VMP Monitoring',

    showIp: true,                    // namayesh IP dar logha
    resourceBootGraceSeconds: 30,    // start shodan resource ha dar in moddat faghat dar console log mishe
    statusIntervalMinutes: 10,       // 0 = gheyr faal
    explosionCooldownMs: 3000,       // cooldown log enfejar baraye har player
    maxQueueSize: 500,

    log: {
        connections: true,
        chat: true,
        deaths: true,
        explosions: true,
        resources: true,
        admin: true,
        rcon: true,
        status: true,
    },
};

const COLORS = {
    connecting: 3447003,
    joined: 3066993,
    dropped: 15158332,
    chat: 9807270,
    command: 16776960,
    death: 10038562,
    explosion: 15105570,
    resource: 10181046,
    admin: 15844367,
    system: 1752220,
    error: 16711680,
    status: 5793266,
};

const EXPLOSION_TYPES = {
    0: 'GRENADE', 1: 'GRENADELAUNCHER', 2: 'STICKYBOMB', 3: 'MOLOTOV', 4: 'ROCKET',
    5: 'TANKSHELL', 6: 'HI_OCTANE', 7: 'CAR', 8: 'PLANE', 9: 'PETROL_PUMP',
    10: 'BIKE', 11: 'DIR_STEAM', 12: 'DIR_FLAME', 13: 'DIR_WATER_HYDRANT', 14: 'DIR_GAS_CANISTER',
    15: 'BOAT', 16: 'SHIP_DESTROY', 17: 'TRUCK', 18: 'BULLET', 19: 'SMOKEGRENADELAUNCHER',
    20: 'SMOKEGRENADE', 21: 'BZGAS', 22: 'FLARE', 23: 'GAS_CANISTER', 24: 'EXTINGUISHER',
    25: 'PROGRAMMABLEAR', 26: 'TRAIN', 27: 'BARREL', 28: 'PROPANE', 29: 'BLIMP',
    30: 'DIR_FLAME_EXPLODE', 31: 'TANKER', 32: 'PLANE_ROCKET', 33: 'VEHICLE_BULLET', 34: 'GAS_TANK',
    35: 'FIREWORK', 36: 'SNOWBALL', 37: 'PROXMINE', 38: 'VALKYRIE_CANNON',
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const RES_NAME = GetCurrentResourceName();
const BOOT_TIME = Date.now();

// Font monospace baraye title/field name/footer (embed ha code block nadaran)
function mono(text) {
    return String(text).replace(/[A-Za-z0-9]/g, (c) => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D670 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D68A + code - 97);
        return String.fromCodePoint(0x1D7F6 + code - 48);
    });
}

function clip(text, max) {
    text = String(text);
    return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

// Hame matn ha dakhel code block => font monospace
function code(text, max = 1000) {
    const clean = String(text).replace(/`/g, "'");
    return '```\n' + clip(clean, max) + '\n```';
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function localTime() {
    try {
        return new Date().toLocaleString('en-GB', { timeZone: CONFIG.timezone, hour12: false });
    } catch (e) {
        return new Date().toISOString();
    }
}

function fmtCoords(x, y, z) {
    return `${Number(x).toFixed(2)}, ${Number(y).toFixed(2)}, ${Number(z).toFixed(2)}`;
}

function hashHex(h) {
    return '0x' + (Number(h) >>> 0).toString(16).toUpperCase();
}

function getCoords(src) {
    try {
        const ped = GetPlayerPed(src);
        if (!ped || ped === 0) return null;
        const c = GetEntityCoords(ped);
        if (!c || (c[0] === 0 && c[1] === 0 && c[2] === 0)) return null;
        return fmtCoords(c[0], c[1], c[2]);
    } catch (e) {
        return null;
    }
}

// ---------------------------------------------------------------------------
// PLAYER INFO
// ---------------------------------------------------------------------------

const players = new Map(); // serverId -> info

function collectInfo(src, fallbackName) {
    src = String(src);
    const ids = {};
    let count = 0;
    try {
        count = GetNumPlayerIdentifiers(src);
    } catch (e) { /* ignore */ }

    for (let i = 0; i < count; i++) {
        const id = GetPlayerIdentifier(src, i);
        if (!id) continue;
        const idx = id.indexOf(':');
        if (idx === -1) continue;
        ids[id.slice(0, idx)] = id.slice(idx + 1);
    }

    let endpoint = null;
    try { endpoint = GetPlayerEndpoint(src); } catch (e) { /* ignore */ }

    let tokens = 0;
    try { tokens = GetNumPlayerTokens(src); } catch (e) { /* ignore */ }

    let name = fallbackName;
    if (!name) {
        try { name = GetPlayerName(src); } catch (e) { /* ignore */ }
    }

    const old = players.get(src) || {};
    const info = {
        id: src,
        name: name || old.name || 'Unknown',
        ids: Object.keys(ids).length ? ids : (old.ids || {}),
        ip: endpoint || (ids.ip) || old.ip || 'N/A',
        tokens: tokens || old.tokens || 0,
        connectedAt: old.connectedAt || Date.now(),
        joinedAt: old.joinedAt || null,
    };
    players.set(src, info);
    return info;
}

function identifierText(info) {
    const order = ['license', 'license2', 'steam', 'fivem', 'discord', 'xbl', 'live'];
    const lines = [];
    const used = new Set();

    for (const key of order) {
        if (info.ids[key]) {
            lines.push(`${key.padEnd(8)}: ${info.ids[key]}`);
            used.add(key);
        }
    }
    for (const key of Object.keys(info.ids)) {
        if (used.has(key) || key === 'ip') continue;
        lines.push(`${key.padEnd(8)}: ${info.ids[key]}`);
    }
    if (CONFIG.showIp) lines.push(`${'ip'.padEnd(8)}: ${info.ip}`);
    lines.push(`${'tokens'.padEnd(8)}: ${info.tokens}`);
    return lines.join('\n');
}

function playerFields(info, extra = []) {
    return [
        { name: 'Player Name', value: info.name, inline: true },
        { name: 'Server ID', value: info.id, inline: true },
        { name: 'Ping', value: safePing(info.id), inline: true },
        ...extra,
        { name: 'Identifiers', value: identifierText(info), inline: false },
    ];
}

function safePing(src) {
    try {
        const p = GetPlayerPing(String(src));
        return p > 0 ? `${p} ms` : 'N/A';
    } catch (e) {
        return 'N/A';
    }
}

// ---------------------------------------------------------------------------
// DISCORD WEBHOOK (queue + batch + rate limit)
// ---------------------------------------------------------------------------

const warned = new Set();
const queues = new Map(); // url -> { items: [], busy: bool }

function getWebhook(category) {
    const specific = GetConvar(`monitoring_webhook_${category}`, '');
    const url = specific || GetConvar('monitoring_webhook', '');
    if (!url) return null;
    if (!/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\//.test(url)) {
        if (!warned.has(url)) {
            warned.add(url);
            console.log(`[monitoring] [ERROR] webhook url namotabar ast (category: ${category})`);
        }
        return null;
    }
    return url;
}

function embedSize(e) {
    let n = (e.title || '').length + (e.description || '').length + ((e.footer && e.footer.text) || '').length;
    for (const f of e.fields || []) n += f.name.length + f.value.length;
    return n;
}

function postJson(urlString, payload, cb) {
    const body = JSON.stringify(payload);
    const u = new URL(urlString);

    const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
    }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            let retryAfter = 1;
            if (res.statusCode === 429) {
                try {
                    const j = JSON.parse(data);
                    if (j.retry_after) retryAfter = Number(j.retry_after);
                } catch (e) {
                    const h = Number(res.headers['retry-after']);
                    if (h) retryAfter = h;
                }
            }
            cb(res.statusCode, retryAfter, data);
        });
    });

    req.on('error', (err) => cb(0, 5, String(err && err.message)));
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
}

function flush(url, q) {
    if (!q.items.length) {
        q.busy = false;
        return;
    }
    q.busy = true;

    const batch = [];
    let size = 0;
    while (q.items.length && batch.length < 10) {
        const s = embedSize(q.items[0]);
        if (batch.length && size + s > 5500) break;
        size += s;
        batch.push(q.items.shift());
    }

    postJson(url, { username: CONFIG.botName, allowed_mentions: { parse: [] }, embeds: batch }, (status, retryAfter, data) => {
        if (status === 429 || status === 0 || status >= 500) {
            q.items.unshift(...batch);
            setTimeout(() => flush(url, q), Math.ceil(retryAfter * 1000) + 200);
            return;
        }
        if (status < 200 || status >= 300) {
            console.log(`[monitoring] [ERROR] discord webhook status ${status}: ${clip(data, 200)}`);
        }
        setTimeout(() => flush(url, q), 600);
    });
}

function enqueue(url, embed) {
    let q = queues.get(url);
    if (!q) {
        q = { items: [], busy: false };
        queues.set(url, q);
    }
    if (q.items.length >= CONFIG.maxQueueSize) q.items.shift();
    q.items.push(embed);
    if (!q.busy) flush(url, q);
}

/*
    Structure har log:

        title        : monospace unicode
        description  : code block (khalase Finglish)
        fields       : name monospace unicode / value code block
        footer       : monospace unicode
*/
function sendDiscordLog(category, color, title, summary, fields) {
    const url = getWebhook(category);
    if (!url) return;

    const allFields = [
        ...fields,
        { name: 'Time', value: localTime(), inline: true },
    ].slice(0, 25);

    enqueue(url, {
        title: mono(title),
        description: code(summary, 1500),
        color,
        fields: allFields.map((f) => ({
            name: mono(f.name),
            value: code(f.value, 1000),
            inline: !!f.inline,
        })),
        footer: { text: mono(`${CONFIG.serverTag} Monitoring | ${RES_NAME}`) },
        timestamp: new Date().toISOString(),
    });
}

function logEvent(category, tag, color, title, summary, fields = []) {
    console.log(`[monitoring] [${tag}] ${summary}`);
    sendDiscordLog(category, color, title, summary, fields);
}

// ---------------------------------------------------------------------------
// PLAYER CONNECTION EVENTS
// ---------------------------------------------------------------------------

on('playerConnecting', (playerName, setKickReason, deferrals) => {
    const src = String(global.source);
    const info = collectInfo(src, playerName);
    info.connectedAt = Date.now();

    if (!CONFIG.log.connections) return;

    logEvent(
        'connections', 'CONNECTING', COLORS.connecting, 'PLAYER CONNECTING',
        `${info.name} ba id ${info.id} darhal etesal be server ast`,
        playerFields(info)
    );
});

on('playerJoining', (oldId) => {
    const src = String(global.source);
    const old = players.get(String(oldId));
    if (old && String(oldId) !== src) players.delete(String(oldId));

    const info = collectInfo(src, undefined);
    if (old) {
        info.connectedAt = old.connectedAt;
        if (old.name && info.name === 'Unknown') info.name = old.name;
    }
    info.joinedAt = Date.now();

    if (!CONFIG.log.connections) return;

    logEvent(
        'connections', 'JOIN', COLORS.joined, 'PLAYER JOINED',
        `${info.name} ba id ${info.id} be server join dad`,
        playerFields(info, [
            { name: 'Temp ID', value: String(oldId), inline: true },
            { name: 'Load Time', value: formatDuration(info.joinedAt - info.connectedAt), inline: true },
            { name: 'Players Online', value: `${getPlayers().length}/${GetConvar('sv_maxclients', '?')}`, inline: true },
        ])
    );
});

on('playerDropped', (reason, resourceName, clientDropReason) => {
    const src = String(global.source);
    const info = players.get(src) || collectInfo(src, undefined);
    const coords = getCoords(src);
    const session = info.joinedAt ? formatDuration(Date.now() - info.joinedAt) : 'N/A';

    if (CONFIG.log.connections) {
        const extra = [
            { name: 'Session Time', value: session, inline: true },
            { name: 'Last Position', value: coords || 'N/A', inline: true },
            { name: 'Drop Reason', value: reason || 'N/A', inline: false },
            { name: 'Resource', value: resourceName || 'N/A', inline: true },
            { name: 'Client Drop Reason', value: String(clientDropReason || 'N/A'), inline: true },
        ];

        logEvent(
            'connections', 'DROP', COLORS.dropped, 'PLAYER DROPPED',
            `${info.name} ba id ${info.id} az server drop shod, reason: ${reason}`,
            playerFields(info, extra)
        );
    }

    players.delete(src);
});

// ---------------------------------------------------------------------------
// CHAT / COMMANDS
// ---------------------------------------------------------------------------

on('chatMessage', (src, author, message) => {
    if (!CONFIG.log.chat) return;
    src = String(src);
    if (!src || src === '0') return;

    const info = players.get(src) || collectInfo(src, author);
    const isCommand = typeof message === 'string' && message.startsWith('/');

    if (isCommand) {
        logEvent(
            'chat', 'COMMAND', COLORS.command, 'COMMAND USED',
            `${info.name} ba id ${info.id} command estefade kard: ${message}`,
            [
                { name: 'Player Name', value: info.name, inline: true },
                { name: 'Server ID', value: info.id, inline: true },
                { name: 'License', value: info.ids.license || 'N/A', inline: false },
                { name: 'Command', value: message, inline: false },
            ]
        );
    } else {
        logEvent(
            'chat', 'CHAT', COLORS.chat, 'CHAT MESSAGE',
            `${info.name} ba id ${info.id} dar chat neveshet: ${message}`,
            [
                { name: 'Player Name', value: info.name, inline: true },
                { name: 'Server ID', value: info.id, inline: true },
                { name: 'License', value: info.ids.license || 'N/A', inline: false },
                { name: 'Message', value: message, inline: false },
            ]
        );
    }
});

// ---------------------------------------------------------------------------
// DEATH / KILL (niaz be resource baseevents)
// ---------------------------------------------------------------------------

onNet('baseevents:onPlayerDied', (killerType, coords) => {
    if (!CONFIG.log.deaths) return;
    const src = String(global.source);
    const info = players.get(src) || collectInfo(src, undefined);
    const pos = coords && coords.length >= 3 ? fmtCoords(coords[0], coords[1], coords[2]) : (getCoords(src) || 'N/A');

    logEvent(
        'deaths', 'DEATH', COLORS.death, 'PLAYER DIED',
        `${info.name} ba id ${info.id} koshte shod`,
        [
            { name: 'Player Name', value: info.name, inline: true },
            { name: 'Server ID', value: info.id, inline: true },
            { name: 'Killer Type', value: String(killerType), inline: true },
            { name: 'Position', value: pos, inline: false },
            { name: 'License', value: info.ids.license || 'N/A', inline: false },
        ]
    );
});

onNet('baseevents:onPlayerKilled', (killerId, data) => {
    if (!CONFIG.log.deaths) return;
    data = data || {};
    const src = String(global.source);
    const info = players.get(src) || collectInfo(src, undefined);
    const killer = players.get(String(killerId)) || (killerId && killerId > 0 ? collectInfo(killerId, undefined) : null);
    const kp = Array.isArray(data.killerpos) ? fmtCoords(data.killerpos[0], data.killerpos[1], data.killerpos[2]) : 'N/A';
    const killerName = killer ? killer.name : 'Unknown';

    logEvent(
        'deaths', 'KILL', COLORS.death, 'PLAYER KILLED',
        `${info.name} ba id ${info.id} tavasot ${killerName} ba id ${killerId} koshte shod`,
        [
            { name: 'Victim', value: `${info.name} [${info.id}]`, inline: true },
            { name: 'Killer', value: `${killerName} [${killerId}]`, inline: true },
            { name: 'Weapon Hash', value: data.weaponhash !== undefined ? hashHex(data.weaponhash) : 'N/A', inline: true },
            { name: 'Victim In Vehicle', value: data.inVehicle ? 'Yes' : 'No', inline: true },
            { name: 'Killer In Vehicle', value: data.killerInVehicle ? 'Yes' : 'No', inline: true },
            { name: 'Killer Vehicle', value: data.killerVehicleName || 'N/A', inline: true },
            { name: 'Killer Position', value: kp, inline: false },
            { name: 'Victim License', value: info.ids.license || 'N/A', inline: false },
            { name: 'Killer License', value: killer ? (killer.ids.license || 'N/A') : 'N/A', inline: false },
        ]
    );
});

// ---------------------------------------------------------------------------
// EXPLOSION
// ---------------------------------------------------------------------------

const explosionCooldown = new Map();

on('explosionEvent', (sender, ev) => {
    if (!CONFIG.log.explosions) return;
    sender = String(sender);

    const now = Date.now();
    if (now - (explosionCooldown.get(sender) || 0) < CONFIG.explosionCooldownMs) return;
    explosionCooldown.set(sender, now);

    const info = players.get(sender) || collectInfo(sender, undefined);
    const type = EXPLOSION_TYPES[ev.explosionType] || String(ev.explosionType);

    logEvent(
        'deaths', 'EXPLOSION', COLORS.explosion, 'EXPLOSION EVENT',
        `${info.name} ba id ${info.id} enfejar ijad kard, type: ${type}`,
        [
            { name: 'Player Name', value: info.name, inline: true },
            { name: 'Server ID', value: info.id, inline: true },
            { name: 'Type', value: `${type} (${ev.explosionType})`, inline: true },
            { name: 'Position', value: fmtCoords(ev.posX, ev.posY, ev.posZ), inline: false },
            { name: 'Damage Scale', value: String(ev.damageScale), inline: true },
            { name: 'Audible', value: ev.isAudible ? 'Yes' : 'No', inline: true },
            { name: 'Invisible', value: ev.isInvisible ? 'Yes' : 'No', inline: true },
            { name: 'License', value: info.ids.license || 'N/A', inline: false },
        ]
    );
});

// ---------------------------------------------------------------------------
// RESOURCES
// ---------------------------------------------------------------------------

function inBootGrace() {
    return (Date.now() - BOOT_TIME) < CONFIG.resourceBootGraceSeconds * 1000;
}

function resourceLog(action, text, resourceName) {
    if (!CONFIG.log.resources) return;
    if (inBootGrace()) {
        console.log(`[monitoring] [RESOURCE] ${text}`);
        return;
    }
    logEvent(
        'resources', 'RESOURCE', COLORS.resource, `RESOURCE ${action}`,
        text,
        [
            { name: 'Resource', value: resourceName, inline: true },
            { name: 'Action', value: action, inline: true },
        ]
    );
}

on('onResourceStarting', (name) => {
    resourceLog('STARTING', `resource ${name} darhal start shodan ast`, name);
});

on('onResourceStart', (name) => {
    if (name === RES_NAME) return;
    resourceLog('STARTED', `resource ${name} start shod`, name);
});

on('onResourceStop', (name) => {
    if (name === RES_NAME) return;
    resourceLog('STOPPED', `resource ${name} stop shod`, name);
});

// ---------------------------------------------------------------------------
// TXADMIN
// ---------------------------------------------------------------------------

function targetName(d) {
    if (d.targetName) return d.targetName;
    if (d.target !== undefined && players.get(String(d.target))) return players.get(String(d.target)).name;
    return 'Unknown';
}

on('txAdmin:events:playerKicked', (d) => {
    if (!CONFIG.log.admin) return;
    const t = players.get(String(d.target));
    logEvent(
        'admin', 'KICK', COLORS.admin, 'PLAYER KICKED',
        `${targetName(d)} ba id ${d.target} tavasot ${d.author} kick shod`,
        [
            { name: 'Target', value: `${targetName(d)} [${d.target}]`, inline: true },
            { name: 'Admin', value: String(d.author), inline: true },
            { name: 'Reason', value: String(d.reason || 'N/A'), inline: false },
            { name: 'License', value: t && t.ids.license ? t.ids.license : 'N/A', inline: false },
        ]
    );
});

on('txAdmin:events:playerBanned', (d) => {
    if (!CONFIG.log.admin) return;
    const exp = d.expiration ? new Date(d.expiration * 1000).toISOString() : 'Permanent';
    logEvent(
        'admin', 'BAN', COLORS.admin, 'PLAYER BANNED',
        `${targetName(d)} ba id ${d.targetNetId} tavasot ${d.author} ban shod`,
        [
            { name: 'Target', value: `${targetName(d)} [${d.targetNetId}]`, inline: true },
            { name: 'Admin', value: String(d.author), inline: true },
            { name: 'Action ID', value: String(d.actionId), inline: true },
            { name: 'Expiration', value: exp, inline: true },
            { name: 'Reason', value: String(d.reason || 'N/A'), inline: false },
            { name: 'Target Identifiers', value: (d.targetIds || []).join('\n') || 'N/A', inline: false },
        ]
    );
});

on('txAdmin:events:playerWarned', (d) => {
    if (!CONFIG.log.admin) return;
    logEvent(
        'admin', 'WARN', COLORS.admin, 'PLAYER WARNED',
        `${targetName(d)} ba id ${d.targetNetId} tavasot ${d.author} warn gereft`,
        [
            { name: 'Target', value: `${targetName(d)} [${d.targetNetId}]`, inline: true },
            { name: 'Admin', value: String(d.author), inline: true },
            { name: 'Action ID', value: String(d.actionId), inline: true },
            { name: 'Reason', value: String(d.reason || 'N/A'), inline: false },
            { name: 'Target Identifiers', value: (d.targetIds || []).join('\n') || 'N/A', inline: false },
        ]
    );
});

on('txAdmin:events:healedPlayer', (d) => {
    if (!CONFIG.log.admin) return;
    const target = d.id === -1 ? 'ALL PLAYERS' : `${targetName({ target: d.id })} [${d.id}]`;
    logEvent(
        'admin', 'HEAL', COLORS.admin, 'PLAYER HEALED',
        `${target} tavasot txAdmin heal shod`,
        [{ name: 'Target', value: target, inline: false }]
    );
});

on('txAdmin:events:announcement', (d) => {
    if (!CONFIG.log.admin) return;
    logEvent(
        'admin', 'ANNOUNCE', COLORS.admin, 'ADMIN ANNOUNCEMENT',
        `${d.author} yek announcement ersal kard`,
        [
            { name: 'Admin', value: String(d.author), inline: true },
            { name: 'Message', value: String(d.message), inline: false },
        ]
    );
});

on('txAdmin:events:scheduledRestart', (d) => {
    if (!CONFIG.log.admin) return;
    logEvent(
        'admin', 'RESTART', COLORS.admin, 'SCHEDULED RESTART',
        `server ta ${d.secondsRemaining} saniye dige restart mishe`,
        [
            { name: 'Seconds Remaining', value: String(d.secondsRemaining), inline: true },
            { name: 'Message', value: String(d.translatedMessage || 'N/A'), inline: false },
        ]
    );
});

on('txAdmin:events:serverShuttingDown', (d) => {
    if (!CONFIG.log.admin) return;
    logEvent(
        'admin', 'SHUTDOWN', COLORS.error, 'SERVER SHUTTING DOWN',
        `server darhal khamoosh shodan ast, author: ${d.author}`,
        [
            { name: 'Admin', value: String(d.author), inline: true },
            { name: 'Delay', value: `${d.delay} ms`, inline: true },
            { name: 'Message', value: String(d.message || 'N/A'), inline: false },
        ]
    );
});

// ---------------------------------------------------------------------------
// RCON
// ---------------------------------------------------------------------------

on('rconCommand', (commandName, args) => {
    if (!CONFIG.log.rcon) return;
    const sensitive = /pass|token|key|secret/i.test(commandName) || (args || []).some((a) => /pass|token|key|secret/i.test(a));
    const full = sensitive ? `${commandName} [HIDDEN]` : `${commandName} ${(args || []).join(' ')}`.trim();

    logEvent(
        'admin', 'RCON', COLORS.admin, 'RCON COMMAND',
        `rcon command ejra shod: ${full}`,
        [{ name: 'Command', value: full, inline: false }]
    );
});

// ---------------------------------------------------------------------------
// STATUS + SYSTEM
// ---------------------------------------------------------------------------

function sendStatus() {
    if (!CONFIG.log.status) return;
    const list = getPlayers().map((id) => {
        const p = players.get(String(id)) || collectInfo(id, undefined);
        return `${String(id).padStart(4)} | ${String(safePing(id)).padEnd(7)} | ${p.name}`;
    });
    const shown = list.slice(0, 40);
    if (list.length > shown.length) shown.push(`... va ${list.length - shown.length} nafar digar`);

    logEvent(
        'system', 'STATUS', COLORS.status, 'SERVER STATUS',
        `vaziat server: ${list.length}/${GetConvar('sv_maxclients', '?')} player online`,
        [
            { name: 'Players', value: `${list.length}/${GetConvar('sv_maxclients', '?')}`, inline: true },
            { name: 'Uptime', value: formatDuration(Date.now() - BOOT_TIME), inline: true },
            { name: 'Resources', value: String(GetNumResources()), inline: true },
            { name: 'Online List', value: shown.length ? 'ID   | Ping    | Name\n' + shown.join('\n') : 'Hich player online nist', inline: false },
        ]
    );
}

on('onResourceStart', (name) => {
    if (name !== RES_NAME) return;

    for (const id of getPlayers()) collectInfo(id, undefined);

    logEvent(
        'system', 'START', COLORS.system, 'MONITORING STARTED',
        `${RES_NAME} start shod`,
        [
            { name: 'Hostname', value: GetConvar('sv_hostname', 'N/A'), inline: false },
            { name: 'Max Clients', value: GetConvar('sv_maxclients', 'N/A'), inline: true },
            { name: 'OneSync', value: GetConvar('onesync', 'N/A'), inline: true },
            { name: 'Players Online', value: String(getPlayers().length), inline: true },
            { name: 'Server Build', value: GetConvar('version', 'N/A'), inline: false },
        ]
    );

    if (!GetConvar('monitoring_webhook', '')) {
        console.log('[monitoring] [ERROR] convar monitoring_webhook set nashode, faghat console log kar mikone');
    }

    if (CONFIG.statusIntervalMinutes > 0) {
        setInterval(sendStatus, CONFIG.statusIntervalMinutes * 60 * 1000);
    }
});

process.on('unhandledRejection', (reason) => {
    const msg = reason && reason.stack ? reason.stack : String(reason);
    logEvent(
        'system', 'ERROR', COLORS.error, 'UNHANDLED REJECTION',
        'yek unhandledRejection dar monitoring rokh dad',
        [{ name: 'Error', value: msg, inline: false }]
    );
});

// Export baraye resource haye dige: exports['vmp-monitoring']:Log(...)
exports('Log', (title, text, category) => {
    logEvent(category || 'system', 'CUSTOM', COLORS.system, String(title).toUpperCase(), String(text), []);
});