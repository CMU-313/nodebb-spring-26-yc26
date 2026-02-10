'use strict';

const db = require.main.require('./src/database');
const topics = require.main.require('./src/topics');
const user = require.main.require('./src/user');
const groups = require.main.require('./src/groups'); // Import groups module
const socketPlugins = require.main.require('./src/socket.io/plugins');

const plugin = {};

/**
 * Task 1: Default questions as unresolved
 * Hook: filter:topic.create
 */
plugin.setTopicDefault = async function (data) {
    data.topic.isResolved = 0; 
    return data;
};

/**
 * Task 2: Organize questions in “resolved” and “unresolved” lists
 * Used a Socket method so the Frontend can call it later to toggle status.
 */
plugin.init = async function (params) {
    // Register the function directly on the imported object
    socketPlugins.taResolve = {};
    socketPlugins.taResolve.toggle = async function (socket, data) {
        if (!socket.uid) {
            throw new Error('[[error:not-logged-in]]');
        }

        // 1. Check Permissions
        const isAdmin = await user.isAdministrator(socket.uid);
        const isGlobalMod = await user.isGlobalModerator(socket.uid);
        const isTA = await groups.isMember(socket.uid, 'Teaching Assistants');

        // Allow if they are ANY of these
        if (!isAdmin && !isGlobalMod && !isTA) {
            throw new Error('[[error:no-privileges]]');
        }

        // --- TOGGLE LOGIC ---
        const isResolved = await topics.getTopicField(data.tid, 'isResolved');
        const newStatus = parseInt(isResolved, 10) === 1 ? 0 : 1;

        await topics.setTopicField(data.tid, 'isResolved', newStatus);

        if (newStatus === 1) {
            await db.sortedSetAdd('topics:resolved', Date.now(), data.tid);
            await db.sortedSetRemove('topics:unresolved', data.tid);
        } else {
            await db.sortedSetAdd('topics:unresolved', Date.now(), data.tid);
            await db.sortedSetRemove('topics:resolved', data.tid);
        }

        return { isResolved: newStatus };
    };
};

/**
 * Hook: filter:topic.reply
 * Purpose: If a Student replies to a Resolved topic, automatically mark it Unresolved.
 */
plugin.checkIfResolved = async function (data) {
    const { tid, uid } = data.post;

    // 1. Check if the topic is currently Resolved
    // We fetch the topic data to see its current state
    const topicData = await topics.getTopicData(tid);
    
    if (parseInt(topicData.isResolved, 10) === 1) {
        
        // 2. Check if the replier is a TA/Admin
        const isAdmin = await user.isAdministrator(uid);
        const isGlobalMod = await user.isGlobalModerator(uid);
        const isTA = await groups.isMember(uid, 'Teaching Assistants');

        // 3. If they are NOT a TA (meaning they are a Student), unresolve it.
        if (!isAdmin && !isGlobalMod && !isTA) {
            await topics.setTopicField(tid, 'isResolved', 0);
            
            // Optional: Log it so you know it happened
            console.log(`[TA-Resolve] Auto-unresolved topic ${tid} because student ${uid} replied.`);
        }
    }

    return data;
};

/**
 * Helper: Ensure the Frontend actually sees the status
 * Hook: filter:topics.get
 */
plugin.appendResolveStatus = async function (data) {
    if (data.topics && data.topics.length) {
        // Fetch isResolved status for all topics in the view
        const tids = data.topics.map(t => t.tid);
        const status = await topics.getTopicsFields(tids, ['isResolved']);
        
        // Merge status into the result
        data.topics.forEach((topic, index) => {
            topic.isResolved = parseInt(status[index].isResolved, 10) === 1;
        });
    }
    return data;
};

/**
 * Hook: filter:category.topics.prepare
 * Purpose: Sorts 'Unresolved' topics to the top of the list.
 */
plugin.sortUnresolvedFirst = async function (data) {
    // 1. SAFETY CHECK (The Fix): 
    // If data is missing, or wrong category, or NO TOPICS exist, stop immediately.
    if (!data || parseInt(data.cid, 10) !== 4 || !data.topics || !Array.isArray(data.topics)) {
        return data;
    }

    const unresolved = [];
    const resolved = [];

    // 2. SPLIT THE TOPICS
    data.topics.forEach(function (topic) {
        // If isResolved is 1, it goes to the bottom.
        // If it's 0 (or null/undefined), it stays at the top.
        data.topics.forEach(function (topic) {
        // DEBUG LOG
            console.log(`Topic ${topic.tid}: isResolved = ${topic.isResolved}`); 

            if (topic.isResolved && parseInt(topic.isResolved, 10) === 1) {
                resolved.push(topic);
            } else {
                unresolved.push(topic);
            }
        });
    });

    // 3. MERGE THEM BACK
    data.topics = unresolved.concat(resolved);

    return data;
};

/**
 * Hook: filter:topic.get
 * Purpose: Tell the frontend template if the viewer is a TA
 */
plugin.appendTAPrivileges = async function (data) {
    const uid = data.uid; 

    if (!uid) {
        return data;
    }

    // 1. Check Permissions
    const isAdmin = await user.isAdministrator(uid);
    const isGlobalMod = await user.isGlobalModerator(uid);
    const isTA = await groups.isMember(uid, 'Teaching Assistants'); // Ensure this matches your group name exactly!

    const isAuthorized = isAdmin || isGlobalMod || isTA;

    // 2. Attach to Main Topic
    data.topic.isTA = isAuthorized;

    // 3. Attach to Every Post (So post.tpl can see it)
    if (data.topic.posts && Array.isArray(data.topic.posts)) {
        data.topic.posts.forEach(post => {
            post.isTA = isAuthorized;
        });
    }

    return data;
};

module.exports = plugin;