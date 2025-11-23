/**
 * Express Node.js application for TopG vote tracking using Webhooks.
 * Final Version: Includes Rank scraping and enhanced logging.
 */
const express = require('express');
const axios = require('axios');
const app = express();

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================
//                  Configuration
// =========================================================

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SERVER_LINK = "https://topg.org/cs-servers/server-671797"; 
const WEBHOOK_BASE_URL = "https://topg-discord-bot-xpg.onrender.com"; 
const SERVER_OWNER_NAME = "XPG";

// Variables to store stats
let lastKnownTotalVotes = 35; 
let lastKnownRank = "N/A";

// =========================================================
//                   Helper Functions
// =========================================================

async function sendStartupMessage() {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await fetchInitialScoreAndRank(); 
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: "🟢 [XPG] Bot is Online & Ready!",
                description: "Listening for TopG.",
                color: 5763719,
                fields: [
                    { name: "Current Score", value: `${lastKnownTotalVotes}`, inline: true },
                    { name: "Current Rank", value: `${lastKnownRank}`, inline: true },
                    // عرض رابط التصويت المباشر للاعبين
                    { name: "🔗 Vote Here", value: `[Click to Vote](${SERVER_LINK})`, inline: false }
                ],
                footer: { text: "System Powered by GlaD" },
                timestamp: new Date().toISOString()
            }]
        });
        console.log("✅ Startup message sent.");
    } catch (error) {
        console.error("❌ Error sending startup message:", error.message);
    }
}

async function sendVoteNotification(currentTotalVotes, currentRank, voterName) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        console.log(`📢 Sending Discord notification for ${voterName}...`);
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: `🌟 New Vote from ${voterName}!`,
                description: `${SERVER_OWNER_NAME} thanks **${voterName}** for voting!`,
                color: 3447003,
                fields: [
                    { name: "Total Score", value: `**${currentTotalVotes}**`, inline: true },
                    { name: "Rank", value: `**${currentRank}**`, inline: true },
                    { name: "Vote Again", value: `[Link](${SERVER_LINK})`, inline: true }
                ],
                footer: { text: "XPlayZm Staff Team" },
                timestamp: new Date().toISOString()
            }]
        });
        console.log("✅ Notification sent successfully.");
    } catch (error) {
        console.error("❌ Failed to send notification:", error.message);
    }
}

function extractScore(html) {
    const match = html.match(/Score.*?(\d+)/s); 
    return match ? parseInt(match[1], 10) : 0;
}

function extractRank(html) {
    // يبحث عن كلمة Rank ويأخذ الرقم أو النص الذي يليها
    // النمط يبحث عن Rank متبوعة بمسافات ثم رقم أو نص (مثل #5 أو 5)
    const match = html.match(/Rank.*?(\d+|#[0-9]+)/s);
    return match ? match[1] : "N/A";
}

async function fetchInitialScoreAndRank() {
    try {
        const { data } = await axios.get(SERVER_LINK);
        const score = extractScore(data);
        const rank = extractRank(data);
        
        if (score > lastKnownTotalVotes) lastKnownTotalVotes = score;
        lastKnownRank = rank;
        
        console.log(`📊 Initial Stats -> Score: ${lastKnownTotalVotes}, Rank: ${lastKnownRank}`);
    } catch (e) {
        console.error("⚠️ Could not fetch initial stats.");
    }
}

// =========================================================
//                         Routes
// =========================================================

app.get('/', (req, res) => {
    res.send(`Bot Running. Score: ${lastKnownTotalVotes}. Rank: ${lastKnownRank}. Endpoint: /vote`);
});

// The Webhook Endpoint
app.post('/vote', async (req, res) => {
    console.log(`\n🔔 [WEBHOOK RECEIVED] at ${new Date().toLocaleTimeString()}`);
    console.log("📦 Body:", JSON.stringify(req.body)); 

    const voterName = req.body.username || req.body.voter_name || req.body.player || req.body.p_resp || "Unknown Voter";

    try {
        // 1. Fetch latest page data
        const { data } = await axios.get(SERVER_LINK);
        const currentScore = extractScore(data);
        const currentRank = extractRank(data);
        
        // 2. Update Rank immediately
        lastKnownRank = currentRank;

        // 3. Check if Score increased (OR force send for testing if needed)
        if (currentScore > lastKnownTotalVotes) {
            const diff = currentScore - lastKnownTotalVotes;
            console.log(`✅ Score increased by ${diff} (New: ${currentScore})`);
            
            for (let i = 0; i < diff; i++) {
                await sendVoteNotification(currentScore, currentRank, voterName);
            }
            lastKnownTotalVotes = currentScore;
        } else {
            console.log(`⚠️ Score unchanged (${currentScore}). Sending notification anyway (Lag/Test).`);
            // Forced notification ensures you see the result even if TopG lags
            await sendVoteNotification(currentScore, currentRank, voterName); 
        }
        
        res.status(200).send("OK");
    } catch (error) {
        console.error("❌ Error processing vote:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
//                         Start
// =========================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    sendStartupMessage();
});