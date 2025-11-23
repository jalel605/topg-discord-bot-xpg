/**
 * Express Node.js application for TopG vote tracking using Webhooks.
 * Updated Version: improved regex for Score/Votes and robust auto-updates.
 */
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================
//                  Configuration
// =========================================================

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
// تأكد من أن الرابط هو رابط صفحة السيرفر وليس رابط التصويت المباشر لضمان قراءة البيانات
const SERVER_LINK = "https://topg.org/cs-servers/server-671797"; 
const WEBHOOK_BASE_URL = "https://topg-discord-bot-xpg.onrender.com"; 
const SERVER_OWNER_NAME = "XPG";

// Global Variables for Stats
let lastKnownTotalVotes = 0; 
let lastKnownRank = "N/A";

// Header to bypass basic bot protections
const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
};

// =========================================================
//                    Helper Functions
// =========================================================

function extractScore(html) {
    // التعديل هنا: البحث عن كلمة Score أو Votes أو Points، ودعم الفواصل في الأرقام (مثل 1,234)
    // Regex logic: Find "Score" or "Votes", followed by any characters, then capture digits and commas
    const match = html.match(/(?:Score|Votes|Points)[^0-9]*([\d,]+)/i);
    if (match && match[1]) {
        // إزالة الفواصل لتحويل النص إلى رقم صحيح (1,234 -> 1234)
        return parseInt(match[1].replace(/,/g, ''), 10);
    }
    return 0;
}

function extractRank(html) {
    // البحث عن الترتيب (Rank)
    const match = html.match(/Rank.*?(\d+|#[0-9]+)/s);
    return match ? match[1] : "N/A";
}

// هذه الدالة هي القلب النابض للتحديث التلقائي
async function fetchScoreAndRank() {
    try {
        console.log("⏱️ Fetching current score and rank from TopG...");
        const { data } = await axios.get(SERVER_LINK, AXIOS_CONFIG);
        
        const score = extractScore(data);
        const rank = extractRank(data);
        
        // تحديث المتغيرات العامة فوراً لتكون متاحة للبوت بأكمله
        if (score !== 0) lastKnownTotalVotes = score;
        if (rank !== "N/A") lastKnownRank = rank;

        console.log(`📊 Current Stats Updated -> Score: ${lastKnownTotalVotes}, Rank: ${lastKnownRank}`);
        return { score: lastKnownTotalVotes, rank: lastKnownRank };
    } catch (e) {
        console.error("⚠️ Failed to fetch current stats.");
        // في حال الفشل، نعود للبيانات القديمة المخزنة
        return { score: lastKnownTotalVotes, rank: lastKnownRank };
    }
}

async function sendStatusUpdateMessage(score, rank) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: "🔄 Server Status Update",
                description: "Automatic update for Server Rank and Total Votes.",
                color: 16776960, // Yellow
                fields: [
                    { name: "🏆 Current Rank", value: `**${rank}**`, inline: true },
                    { name: "🗳️ Total Votes", value: `**${score}**`, inline: true },
                    { name: "🔗 Vote Link", value: `[Click Here to Vote](${SERVER_LINK})`, inline: false }
                ],
                footer: { text: "Auto-Update System" },
                timestamp: new Date().toISOString()
            }]
        });
        console.log("✅ Status update message sent.");
    } catch (error) {
        console.error("❌ Error sending status update:", error.message);
    }
}

async function sendVoteNotification(currentTotalVotes, currentRank, voterName) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: `🌟 New Vote Received!`,
                description: `Thank you **${voterName}** for supporting ${SERVER_OWNER_NAME}!`,
                color: 3447003, // Blue
                fields: [
                    { name: "📈 New Total Votes", value: `**${currentTotalVotes}**`, inline: true },
                    { name: "🏅 Current Rank", value: `**${currentRank}**`, inline: true },
                    { name: "🗳️ Vote Again", value: `[Link](${SERVER_LINK})`, inline: true }
                ],
                footer: { text: "XPlayZm Staff Team" },
                timestamp: new Date().toISOString()
            }]
        });
        console.log(`✅ Notification sent for voter: ${voterName}`);
    } catch (error) {
        console.error("❌ Failed to send vote notification:", error.message);
    }
}

async function sendStartupMessage() {
    // جلب البيانات عند التشغيل مباشرة
    await fetchScoreAndRank();
    
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: "🟢 Bot Online",
                description: "System started. Monitoring Votes & Rank automatically.",
                color: 5763719, // Green
                fields: [
                    { name: "Starting Score", value: `${lastKnownTotalVotes}`, inline: true },
                    { name: "Starting Rank", value: `${lastKnownRank}`, inline: true }
                ],
                timestamp: new Date().toISOString()
            }]
        });
        console.log("✅ Startup message sent.");
    } catch (error) {
        console.error("❌ Error sending startup message:", error.message);
    }
}

// =========================================================
//                  CRON JOB (Auto-Update)
// =========================================================

function startAutoUpdater() {
    // يتم التشغيل كل 15 دقيقة
    cron.schedule('*/15 * * * *', async () => {
        console.log('--- 🔄 Auto-Update Job Started ---');
        // هذه الدالة ستقوم بتحديث الـ Score والـ Rank تلقائياً من الموقع
        const { score, rank } = await fetchScoreAndRank();
        
        // إرسال رسالة الحالة بالبيانات الجديدة
        await sendStatusUpdateMessage(score, rank);
        console.log('--- ✅ Auto-Update Job Finished ---');
    }, {
        scheduled: true,
        timezone: "Asia/Riyadh"
    });
    console.log("⏰ Auto-update job scheduled (Every 15 mins).");
}

// =========================================================
//                          Routes
// =========================================================

app.get('/', (req, res) => {
    res.send(`Bot Status: Online. <br>Votes: ${lastKnownTotalVotes} <br>Rank: ${lastKnownRank}`);
});

app.post('/vote', async (req, res) => {
    console.log(`\n🔔 [WEBHOOK] Vote received at ${new Date().toLocaleTimeString()}`);
    
    const voterName = req.body.username || req.body.voter_name || req.body.p_resp || "Unknown Voter";

    try {
        // 1. Force fetch fresh data from TopG website
        const { score: currentScore, rank: currentRank } = await fetchScoreAndRank();
        
        // 2. Logic: If the site hasn't updated yet (caching), artificially add 1 for the notification
        // ولكن الاعتماد الأساسي يظل على الموقع في التحديث التالي
        let displayScore = currentScore;
        
        if (currentScore <= lastKnownTotalVotes) {
            console.log("⚠️ Site lag detected: Score hasn't updated on page yet.");
             // (اختياري) يمكنك جعلها تظهر الرقم القديم + 1 مؤقتاً في الرسالة فقط
             // displayScore = lastKnownTotalVotes + 1; 
        }

        // Send the notification
        await sendVoteNotification(displayScore, currentRank, voterName);
        
        res.status(200).send("OK");
    } catch (error) {
        console.error("❌ Error processing webhook:", error.message);
        res.status(500).send("Error");
    }
});

// =========================================================
//                          Start
// =========================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    sendStartupMessage();
    startAutoUpdater();
});