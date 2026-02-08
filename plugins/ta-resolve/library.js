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
 * We define a Socket method so the Frontend can call it later to toggle status.
 */
plugin.init = async function (params) {
    // We register the function directly on the imported object
    socketPlugins.taResolve = {};
    socketPlugins.taResolve.toggle = async function (socket, data) {
        if (!socket.uid) {
            throw new Error('[[error:not-logged-in]]');
        }

        // --- PERMISSION CHECK ---
        const isAdmin = await user.isAdministrator(socket.uid);
        
        // Ensure you created a group named "Teaching Assistants" in the Admin Panel
        const isTA = await groups.isMember(socket.uid, 'Teaching Assistants');

        if (!isAdmin && !isTA) {
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
 * Optional: Resolved discussions are distinct and cannot be replied to.
 * Hook: filter:topic.reply
 */
// plugin.checkIfResolved = async function (data) {
//     const isResolved = await topics.getTopicField(data.topic.tid, 'isResolved');
    
//     if (parseInt(isResolved, 10) === 1) {
//         throw new Error('This discussion is resolved and cannot be replied to.');
//     }
    
//     return data;
// };

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

module.exports = plugin;