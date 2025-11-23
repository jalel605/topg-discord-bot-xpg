/**
 * Express Node.js application for TopG vote tracking using Webhooks.
 * Final Version: Includes Rank scraping, enhanced logging, and User-Agent bypass for 503 errors.
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
let lastKnownTotalVotes = 36; 
let lastKnownRank = "N/A";

// The bypass header to pretend we are a real browser (Essential for fixing 503 error)
const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
};

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
    const match = html.match(/Rank.*?(\d+|#[0-9]+)/s);
    return match ? match[1] : "N/A";
}

async function fetchInitialScoreAndRank() {
    try {
        // Using AXIOS_CONFIG to bypass 503
        const { data } = await axios.get(SERVER_LINK, AXIOS_CONFIG); 
        const score = extractScore(data);
        const rank = extractRank(data);
        
        if (score > lastKnownTotalVotes) lastKnownTotalVotes = score;
        lastKnownRank = rank;
        
        console.log(`📊 Initial Stats -> Score: ${lastKnownTotalVotes}, Rank: ${lastKnownRank}`);
    } catch (e) {
        console.error("⚠️ Could not fetch initial stats (Check logs for 503).");
        console.error("Error details:", e.message); 
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
        // 1. Fetch latest page data (Using AXIOS_CONFIG)
        const { data } = await axios.get(SERVER_LINK, AXIOS_CONFIG); 
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
        
        res