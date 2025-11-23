/**
 * Express Node.js application for TopG vote tracking.
 * Mechanism: Polling/Scraping the TopG page every 5 minutes.
 */
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================
//                  Configuration
// =========================================================

// Discord Webhook URL (must be set as an environment variable)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
// TopG server link for scraping (Updated to 671797 as per your input)
const SERVER_LINK = "https://topg.org/cs-servers/server-671797"; 

// Server owner name used in the notification message (Updated to XPG)
const SERVER_OWNER_NAME = "XPG";

// Variable to store the last known vote count (Score)
let lastKnownTotalVotes = 0;

// =========================================================
//                   Discord Webhook Functions
// =========================================================

async function sendStartupMessage() {
    if (!DISCORD_WEBHOOK_URL) {
        console.warn("⚠️ Warning: DISCORD_WEBHOOK_URL environment variable is not set. Discord notifications will be disabled.");
        return;
    }

    try {
        console.log("Sending Startup Message to Discord...");
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [
                {
                    // Updated title with [XPG]
                    title: "🟢 [XPG] Bot is Online & Ready!",
                    description: "The TopG vote tracking system is now active. Checking for new votes every 5 minutes.",
                    color: 5763719, // Green color
                    fields: [
                        {
                            name: "🌍 Server Status",
                            value: "Polling TopG score...",
                            inline: true
                        },
                        {
                            name: "🔗 Check Link",
                            value: `[TopG Server Page](${SERVER_LINK})`,
                            inline: true
                        },
                        {
                            name: "⚠️ Reliability Note",
                            value: "Votes may be delayed up to 5 minutes. Total votes lost on server restart.",
                            inline: false
                        }
                    ],
                    footer: {
                        text: "System Powered by GlaD"
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        });
        console.log("Startup message sent successfully.");
    } catch (error) {
        console.error("Error sending startup message:", error.message);
    }
}

async function sendNewVoteNotification(currentTotalVotes) {
    if (!DISCORD_WEBHOOK_URL) return;

    try {
        console.log(`Sending new vote notification. New total: ${currentTotalVotes}.`);
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [
                {
                    title: `🌟 New Vote Received! (Score: ${currentTotalVotes}) 🗳️`,
                    description: `${SERVER_OWNER_NAME} thanks a valued XPlayGaming member for voting on TopG! 🎉 ✨`, 
                    color: 3447003,
                    fields: [
                        { name: "Total Score", value: `**${currentTotalVotes}**`, inline: true },
                        { name: "Vote Again", value: `[Link](${SERVER_LINK})`, inline: true }
                    ],
                    footer: {
                        text: "Thanks from the XPlayZm Staff Team! 💖"
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        });
        console.log(`✅ Discord notification sent successfully for new vote.`);

    } catch (error) { 
        console.error(`❌ FAILED to send Discord notification for new vote.`);
        console.error(`Error details: ${error.message}`);
    }
}


// =========================================================
//                         Express Routes
// =========================================================

// Main route (Health Check)
app.get('/', (req, res) => {
    res.status(200).send(`Server is Running. Last known score: ${lastKnownTotalVotes}`);
});

// =========================================================
//                   Polling Functions
// =========================================================

/**
 * Function to scrape and extract the Score from TopG's HTML content.
 * It searches for the number that immediately follows the word "Score".
 */
function extractScoreFromHtml(html) {
    const searchString = "Score";
    const startIndex = html.indexOf(searchString);

    if (startIndex !== -1) {
        // Take a large snippet after 'Score' to look for the number
        const snippet = html.substring(startIndex, startIndex + 100);
        
        // Flexible Regex to find the first integer (\d+) after 'Score', ignoring HTML tags and spaces
        const scoreMatch = snippet.match(/(\d+)/); 

        if (scoreMatch && scoreMatch[1]) {
            const score = parseInt(scoreMatch[1], 10);
            console.log(`[Scraping] Successfully extracted score: ${score}`);
            return score;
        }
    }
    console.warn("[Scraping] Could not find the Score number in the HTML content.");
    return 0;
}

/**
 * TopG check function: runs periodically every 5 minutes.
 */
async function checkTopGVotes() {
    console.log(`--- Running TopG poll job at ${new Date().toLocaleTimeString()} ---`);
    let currentScore = 0;

    try {
        // 1. Fetch HTML content
        const response = await axios.get(SERVER_LINK);
        const html = response.data;
        
        // 2. Extract Score
        currentScore = extractScoreFromHtml(html);

        if (currentScore > 0) {
            // Initial run: set score, no notification
            if (lastKnownTotalVotes === 0) {
                lastKnownTotalVotes = currentScore;
                console.log(`[Polling] Initial score set to ${currentScore}. No notification sent.`);
                return;
            }

            // 3. Compare new score with last known score
            if (currentScore > lastKnownTotalVotes) {
                const newVotes = currentScore - lastKnownTotalVotes;
                console.log(`🎉 New votes detected! Count: ${newVotes}.`);
                
                // Send notification for each new vote
                for (let i = 0; i < newVotes; i++) {
                    await sendNewVoteNotification(currentScore);
                }

                // 4. Update last known score
                lastKnownTotalVotes = currentScore;
            } else if (currentScore < lastKnownTotalVotes) {
                // Monthly reset or server reset
                console.warn(`[Polling] Score decreased (from ${lastKnownTotalVotes} to ${currentScore}). Resetting last known score.`);
                lastKnownTotalVotes = currentScore;
            } else {
                console.log("[Polling] No new votes detected. Score unchanged.");
            }
        } else {
            console.error("❌ Failed to extract score from TopG page HTML. Scraping logic may be broken or score is 0.");
        }

    } catch (error) {
        console.error("❌ Error during TopG polling:", error.message);
    }
}

// =========================================================
//                         Cron Job Scheduling
// =========================================================

// Schedule: Check TopG page every 5 minutes ('*/5 * * * *')
cron.schedule('*/5 * * * *', checkTopGVotes, {
    timezone: "UTC"
});


// =========================================================
//                   Server Startup
// =========================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server started successfully on port: ${PORT}`);
    
    // 1. Send startup message
    sendStartupMessage();
    
    // 2. Run initial check immediately
    checkTopGVotes();
});