const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BASE_URL = 'https://devapigw.vidalhealthtpa.com/srm-quiz-task';
const POLL_DELAY_MS = 5000; // 5 seconds between polls

// Utility: sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Store state for SSE streaming
let clients = [];

function sendSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(client => client.write(payload));
}

// SSE endpoint for real-time updates
app.get('/api/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    clients.push(res);
    req.on('close', () => {
        clients = clients.filter(c => c !== res);
    });
});

// Main quiz processing endpoint
app.get('/api/run', async (req, res) => {
    const regNo = req.query.regNo;
    if (!regNo) {
        return res.status(400).json({ error: 'regNo is required' });
    }

    try {
        const allEvents = [];
        const pollResponses = [];

        // Step 1: Poll 10 times (0-9)
        for (let poll = 0; poll <= 9; poll++) {
            sendSSE({ type: 'poll_start', poll });

            const url = `${BASE_URL}/quiz/messages?regNo=${encodeURIComponent(regNo)}&poll=${poll}`;
            const response = await fetch(url);

            if (!response.ok) {
                const errText = await response.text();
                sendSSE({ type: 'poll_error', poll, error: errText });
                continue;
            }

            const data = await response.json();
            pollResponses.push(data);

            const eventCount = data.events ? data.events.length : 0;
            sendSSE({
                type: 'poll_complete',
                poll,
                eventCount,
                setId: data.setId,
                events: data.events || []
            });

            allEvents.push(...(data.events || []));

            // Wait 5 seconds before next poll (except after last one)
            if (poll < 9) {
                sendSSE({ type: 'waiting', poll, nextPoll: poll + 1 });
                await sleep(POLL_DELAY_MS);
            }
        }

        // DEBUG: Log all raw events
        console.log('\n===== DEBUG: All raw events =====');
        console.log(`Total raw events: ${allEvents.length}`);
        allEvents.forEach((e, i) => {
            console.log(`  [${i}] roundId=${e.roundId}, participant=${e.participant}, score=${e.score}`);
        });

        // Step 2: Deduplicate using (roundId + participant)
        const seen = new Set();
        const uniqueEvents = [];
        let duplicateCount = 0;

        for (const event of allEvents) {
            const key = `${event.roundId}::${event.participant}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueEvents.push(event);
            } else {
                duplicateCount++;
                console.log(`  DUPLICATE REMOVED: ${key} (score=${event.score})`);
            }
        }

        // DEBUG: Log unique events and totals
        console.log(`\n===== DEBUG: After dedup =====`);
        console.log(`Unique events: ${uniqueEvents.length}, Duplicates removed: ${duplicateCount}`);
        const rawTotal = allEvents.reduce((s, e) => s + e.score, 0);
        const dedupTotal = uniqueEvents.reduce((s, e) => s + e.score, 0);
        console.log(`Raw total: ${rawTotal}, Deduped total: ${dedupTotal}`);
        uniqueEvents.forEach(e => {
            console.log(`  KEPT: roundId=${e.roundId}, participant=${e.participant}, score=${e.score}`);
        });

        sendSSE({
            type: 'dedup_complete',
            totalRaw: allEvents.length,
            unique: uniqueEvents.length,
            duplicates: duplicateCount
        });

        // Step 3: Aggregate scores per participant
        const scoreMap = {};
        for (const event of uniqueEvents) {
            if (!scoreMap[event.participant]) {
                scoreMap[event.participant] = 0;
            }
            scoreMap[event.participant] += event.score;
        }

        // Step 4: Generate leaderboard sorted by totalScore (descending)
        const leaderboard = Object.entries(scoreMap)
            .map(([participant, totalScore]) => ({ participant, totalScore }))
            .sort((a, b) => b.totalScore - a.totalScore);

        const totalScore = leaderboard.reduce((sum, entry) => sum + entry.totalScore, 0);

        sendSSE({
            type: 'leaderboard_ready',
            leaderboard,
            totalScore
        });

        // Step 5: Submit leaderboard
        const submitUrl = `${BASE_URL}/quiz/submit`;
        const submitBody = {
            regNo,
            leaderboard
        };

        sendSSE({ type: 'submitting' });

        const submitResponse = await fetch(submitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submitBody)
        });

        const submitResult = await submitResponse.json();

        sendSSE({
            type: 'submit_result',
            result: submitResult
        });

        // Return final result
        res.json({
            regNo,
            pollResponses: pollResponses.length,
            totalRawEvents: allEvents.length,
            uniqueEvents: uniqueEvents.length,
            duplicatesRemoved: duplicateCount,
            leaderboard,
            totalScore,
            submitResult
        });

    } catch (error) {
        sendSSE({ type: 'error', message: error.message });
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n  🏆 Quiz Leaderboard System running at http://localhost:${PORT}\n`);
});
