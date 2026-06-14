// switch from local to live host
const API_URL = "https://voyager-analytics-pro.onrender.com";

async function authFetch(url, options = {}){
    const res = await fetch(url, options);

    if(res.status === 401){
        return {
            ok: false,
            status: 401,
            json: async () => ({ error: "Session expired. Please log in again." })
        };
    }

    return res;
}

// API functions
// Register a new user
async function registerUser(userData) {

    const response = await fetch(
        `${API_URL}/register`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(userData)
        }
    );

    return response.json();
}
 
// Log in an existing user
async function loginUser(userData) {

    const response = await fetch(
        `${API_URL}/login`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(userData)
        }
    );

    return response.json();
}

// Create a new account for the logged-in user(broker account)
async function createAccount(accountData, token) {

    const response = await fetch(
        `${API_URL}/accounts`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },

            body: JSON.stringify(accountData)
        }
    );

    return response.json();
}


async function getAccounts(token) {

    const response = await fetch(
        `${API_URL}/accounts`,
        {
            method: "GET",

            headers: {
                "Authorization": `Bearer ${token}`
            }
        }
    );

    return response.json();
}


// Delete an account for the logged-in user(broker account)
async function deleteAccount(
    accountId,
    token
){

    const response = await fetch(

        `${API_URL}/accounts/${accountId}`,

        {
            method:"DELETE",

            headers:{
                "Authorization":
                `Bearer ${token}`
            }
        }

    );

    return response.json();
}


// Create a new trade for the logged-in user(broker account)
async function createTrade(
    tradeData,
    token
){

    const response =
    await fetch(

        `${API_URL}/trades`,

        {
            method:"POST",

            headers:{
                "Content-Type":
                "application/json",

                "Authorization":
                `Bearer ${token}`
            },

            body:JSON.stringify(
                tradeData
            )
        }
    );

    return response.json();
}

// Get all trades for the logged-in user(broker account)
async function getTrades(
    token
){

    const response =
    await fetch(

        `${API_URL}/trades`,

        {
            headers:{
                "Authorization":
                `Bearer ${token}`
            }
        }
    );

    return response.json();
}

// Delete a trade for the logged-in user(broker account)
async function deleteTrade(
    tradeId,
    token
){

    const response =
    await fetch(

        `${API_URL}/trades/${tradeId}`,

        {
            method:"DELETE",

            headers:{
                "Authorization":
                `Bearer ${token}`
            }
        }
    );

    return response.json();
}

// Get analytics data for the logged-in user(broker account)
async function getAnalytics(
    token
){

    const response =
    await fetch(

        `${API_URL}/analytics`,

        {
            headers:{
                "Authorization":
                `Bearer ${token}`
            }
        }

    );

    return response.json();

}

// Get journal
async function getJournals(){

    const response =
    await fetch(
        `${API_URL}/journals`
    );

    return response.json();

}

    // Create a new journal entry
async function createJournal(
    token,
    journalData
){

    const response =
    await fetch(
        `${API_URL}/journals`,
        {

            method:"POST",

            headers:{

                "Content-Type":
                "application/json",

                "Authorization":
                `Bearer ${token}`

            },

            body:JSON.stringify(
                journalData
            )

        }
    );

    return response.json();

}

async function getJournals(
    token
){

    const response =
    await fetch(
        `${API_URL}/journals`,
        {

            headers:{

                "Authorization":
                `Bearer ${token}`

            }

        }
    );

    return response.json();

}

// mt5 account sync
async function syncMT5(token){

    const response =
    await fetch(

        `${API_URL}/mt5/sync`,

        {
            method:"POST",

            headers:{
                Authorization:
                `Bearer ${token}`
            }
        }

    );

    return response.json();

}

    // live mt5 account sync(dashboard view)
async function getMT5Account(token){

    const response =
    await fetch(

        `${API_URL}/mt5/account`,

        {
            headers:{
                Authorization:
                `Bearer ${token}`
            }
        }

    );

    return response.json();

}


// calendar heatmap data for the logged-in user(broker account)
async function getHeatmap(token){

    const response =
    await fetch(

        `${API_URL}/analytics/heatmap`,

        {
            headers:{
                Authorization:
                `Bearer ${token}`
            }
        }

    );

    return response.json();

}

// monthly Summary(above calendar)
async function getDayTrades(token,date){

    const response =
    await fetch(

        `${API_URL}/analytics/day/${date}`,

        {
            headers:{
                Authorization:
                `Bearer ${token}`
            }
        }

    );

    return await response.json();

}

// Monthly Review
async function getMonthlyPerformance(token){
    const response =
    await fetch(
        
        `${API_URL}/analytics/monthly`,
        {
            headers:{
                Authorization:
                `Bearer ${token}`
            }
        }
    );

    return await response.json();
}


// Local sync agent
async function syncFromAgent(token) {
    const response = await fetch("http://127.0.0.1:5001/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
    });
    return response.json();
}

async function checkAgent() {
    try {
        const response = await fetch("http://127.0.0.1:5001/status");
        return response.ok;
    } catch(e) {
        return false;
    }
}
