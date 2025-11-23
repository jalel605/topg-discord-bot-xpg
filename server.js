/**
 * Express Node.js application for TopG vote tracking using Webhooks (Instant Notification).
 * Mechanism: It receives an instant notification (Webhook) from TopG when a vote occurs.
 */
const express = require('express');
const axios = require('axios');
// Cron is removed as we are no longer polling
const app = express();

// Middleware to parse incoming request bodies (essential for Webhooks)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================
//                  Configuration
// =========================================================

// Discord Webhook URL (must be set as an environment variable)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
// TopG server link
const SERVER_LINK = "https://topg.org/cs-servers/server-671797"; 

// Server owner name
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
        await fetchInitialScore(); 

        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [
                {
                    title: "🟢 [XPG] Bot is Online & Ready! (Webhook Mode)",
                    description: "The TopG vote tracking system is now active. **Waiting for instant Webhook notifications.**",
                    color: 5763719,
                    fields: [
                        {
                            name: "🌍 Server Status",
                            value: `Initialized with score: ${lastKnownTotalVotes}`,
                            inline: true
                        },
                        {
                            name: "🔗 Webhook Endpoint",
                            value: "/vote",
                            inline: true
                        },
                        {
                            name: "📌 Reliability Note",
                            value: "Notifications are instant, relying on TopG Postback. Score is volatile (stored in RAM).",
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

async function sendNewVoteNotification(currentTotalVotes, voterName = "Unknown Member") {
    if (!DISCORD_WEBHOOK_URL) return;

    try {
        console.log(`Sending new vote notification. New total: ${currentTotalVotes}. Voter: ${voterName}`);
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [
                {
                    title: `🌟 New Vote from ${voterName}! (Score: ${currentTotalVotes}) 🗳️`,
                    description: `${SERVER_OWNER_NAME} thanks **${voterName}** for supporting the server via TopG! 🎉 ✨`, 
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
//                   Score Scraping Function (For Initialization Only)
// =========================================================

function extractScoreFromHtml(html) {
    const searchString = "Score";
    const startIndex = html.indexOf(searchString);

    if (startIndex !== -1) {
        const snippet = html.substring(startIndex, startIndex + 100);
        const scoreMatch = snippet.match(/(\d+)/); 
        if (scoreMatch && scoreMatch[1]) {
            return parseInt(scoreMatch[1], 10);
        }
    }
    return 0;
}

async function fetchInitialScore() {
    try {
        const response = await axios.get(SERVER_LINK);
        const html = response.data;
        const initialScore = extractScoreFromHtml(html);
        if (initialScore > 0) {
            lastKnownTotalVotes = initialScore;
            console.log(`[Initialization] Initial score set to ${initialScore}.`);
        } else {
            console.warn("[Initialization] Could not fetch initial score, starting from 0.");
        }
    } catch (error) {
        console.error("[Initialization] Error fetching initial score:", error.message);
    }
}


// =========================================================
//                         Express Routes
// =========================================================

// Main route (Health Check)
app.get('/', (req, res) => {
    res.status(200).send(`Server is Running (Webhook Mode). Last known score: ${lastKnownTotalVotes}`);
});

/**
 * Webhook Endpoint: This route is called INSTANTLY by TopG when a vote occurs.
 */
app.post('/vote', async (req, res) => {
    console.log("=================================================");
    console.log(`🎉 Webhook Received at ${new Date().toLocaleTimeString()}!`);
    
    // Attempt to extract the voter's name from the request body
    // The name 'username' is commonly used by listing sites.
    const voterName = req.body.username || req.body.voter_name || req.body.id || "Unknown Member"; 
    console.log(`Request Body Data: ${JSON.stringify(req.body)}`); // Logs the raw data for debugging

    let currentScore = 0;
    try {
        // Scrape the score instantly after receiving the Webhook to verify the count.
        const response = await axios.get(SERVER_LINK);
        const html = response.data;
        currentScore = extractScoreFromHtml(html);

        if (currentScore > 0 && currentScore > lastKnownTotalVotes) {
            const newVotes = currentScore - lastKnownTotalVotes;
            console.log(`New votes detected! Count: ${newVotes}. Current score: ${currentScore}. Voter: ${voterName}`);
            
            for (let i = 0; i < newVotes; i++) {
                await sendNewVoteNotification(currentScore, voterName); // Pass the extracted name
            }

            lastKnownTotalVotes = currentScore;
            res.status(200).send("Vote Processed & Notification Sent.");

        } else if (currentScore <= lastKnownTotalVotes) {
            // Retry logic (TopG score might update slightly slower than the Webhook is sent)
            console.warn(`Webhook received, but score (${currentScore}) has not increased yet. Retrying in 1.5 seconds...`);
            
            await new Promise(resolve => setTimeout(resolve, 1500)); 

            const retryResponse = await axios.get(SERVER_LINK);
            const retryHtml = retryResponse.data;
            const retryScore = extractScoreFromHtml(retryHtml);

            if (retryScore > lastKnownTotalVotes) {
                 const newVotes = retryScore - lastKnownTotalVotes;
                 console.log(`Retry successful! New votes: ${newVotes}. Score: ${retryScore}. Voter: ${voterName}`);
                 for (let i = 0; i < newVotes; i++) {
                    await sendNewVoteNotification(retryScore, voterName);
                 }
                 lastKnownTotalVotes = retryScore;
                 res.status(200).send("Vote Processed after Retry & Notification Sent.");
            } else {
                 console.error("❌ Score did not increase even after retry. Possible duplicate/error.");
                 res.status(200).send("Vote received, but score unchanged.");
            }
        } else {
            console.error("❌ Score could not be extracted.");
            res.status(400).send("Error processing vote.");
        }

    } catch (error) {
        console.error("❌ Error processing webhook:", error.message);
        res.status(500).send("Internal Server Error.");
    }
    console.log("=================================================");
});

// =========================================================
//                   Server Startup
// =========================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`🚀 Server started successfully on port: ${PORT}`);
    
    // Send startup message (will also fetch initial score)
    await sendStartupMessage();
});
```eof

---

## 🚀 Setup Steps

### Step 1: Update and Deploy Code

1.  **Replace** the content of your `server.js` file with the code above.
2.  **Commit and Push:** Push the changes to your GitHub repository (e.g., in Codespaces: `git commit -m "Implement TopG Webhook with Voter Name"`, then `git push`).
3.  **Wait for Render:** Wait for Render to automatically deploy the new version of your service.

### Step 2: Configure Render and UptimeRobot

Ensure these foundational steps are correct to keep the service running 24/7 and to connect TopG:

1.  **Render Configuration:** Ensure your **Build Command** is set to `npm install` and the **Start Command** is set to `node server.js`.
2.  **Service Link:** Get your service URL from the Render Dashboard (e.g., `https://topg-discord-bot.onrender.com`).
3.  **UptimeRobot:** The service must be monitored by UptimeRobot with the URL `https://topg-discord-bot.onrender.com` checked every 5 minutes to prevent idling.

### Step 3: Configure TopG Postback (Crucial for Name)

This is the most critical step to get the voter's name.

1.  **Go to TopG Settings:** Navigate to the settings page for your server on TopG (where you saw the Postback URL field).
2.  **Set Postback URL:** In the **Postback URL** field, enter the full Webhook address:
    ```
    https://topg-discord-bot.onrender.com/vote
    ```
3.  **Enable Username Field (TopG Specific):** You must ensure that TopG is configured to **ask the user for their name/ID** on the vote page. Without this, TopG has no name to send.
4.  **Configure Custom Parameter (If needed):** Look for an area in TopG settings (near Postback URL) to add **custom parameters** or **variables**. You need to instruct TopG to send the name under a known variable name.
    * **Field Name to send:** `username`
    * **Value to use:** `[VOTER_NAME]` (or the specific variable TopG uses for the input name field).
5.  **Save Changes:** Click **Submit** or **Save** on the TopG page.

### Step 4: Test and Debug

1.  **Vote:** Ask a player to vote, ensuring they enter a name (e.g., "TestingName").
2.  **Check Render Logs:** Immediately check the **Logs** section in your Render dashboard.
3.  **Look for this output:**
    * You should see: `Request Body Data: {"username": "TestingName"}` (or something similar).
    * If you see the name here, the process is successful!
    * If you see: `Request Body Data: {}` or a blank object, TopG is not sending the name, and you must review the TopG settings for enabling custom variables/parameters. The bot will use "Unknown Member" in this case.