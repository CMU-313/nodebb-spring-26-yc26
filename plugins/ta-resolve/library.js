'use strict';

const db = require.main.require('./src/database');
const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const user = require.main.require('./src/user');
const groups = require.main.require('./src/groups'); // Import groups module
const socketPlugins = require.main.require('./src/socket.io/plugins');

const plugin = {};

/**
 * Task 1: Default questions as unresolved
 * Hook: filter:topic.create
 */
plugin.setTopicDefault = async function (data) {
    // Logs for debugging
    // console.log('[TA-Resolve] setTopicDefault called for topic:', data.topic.tid);
    data.topic.isResolved = 0;
    // console.log('[TA-Resolve] Set isResolved to 0 for topic:', data.topic.tid);
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

    // Support Answer: admins can mark a post as "Supported by Instructor"
    socketPlugins.taResolve.supportAnswer = async function (socket, data) {
        if (!socket.uid) {
            throw new Error('[[error:not-logged-in]]');
        }
        
        // Check permissions - allow admin, global mod, or TA
        const isAdmin = await user.isAdministrator(socket.uid);
        const isGlobalMod = await user.isGlobalModerator(socket.uid);
        const isTA = await groups.isMember(socket.uid, 'Teaching Assistants');
        
        if (!isAdmin && !isGlobalMod && !isTA) {
            throw new Error('[[error:no-privileges]]');
        }
        if (!data || !data.pid) {
            throw new Error('[[error:invalid-data]]');
        }
        const value = data.remove ? 0 : 1;
        await posts.setPostField(data.pid, 'supportedByInstructor', value);
        return { supportedByInstructor: value };
    };

    // Remove support: same socket, pass remove: true
    socketPlugins.taResolve.removeSupport = async function (socket, data) {
        return socketPlugins.taResolve.supportAnswer(socket, { ...data, remove: true });
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
            
            // Logs for debugging
            // console.log(`[TA-Resolve] Auto-unresolved topic ${tid} because student ${uid} replied.`);
        }
    }

    return data;
};

/**
 * Helper: Ensure the Frontend actually sees the status AND sort for staff
 * Hook: filter:topics.get
 */
plugin.appendResolveStatusAndSort = async function (data) {
    try {
        // Logs for debugging
        // console.log('[TA-Resolve] appendResolveStatusAndSort called, topics count:', data.topics ? data.topics.length : 0);
        
        if (!data.topics || !data.topics.length) {
            // Logs for debugging
            // console.log('[TA-Resolve] No topics to process');
            return data;
        }

        // Fetch isResolved status for all topics in the view
        const tids = data.topics.map(t => t.tid);
        const status = await topics.getTopicsFields(tids, ['isResolved']);
        // Logs for debugging
        // console.log('[TA-Resolve] Fetched isResolved status:', status);
        
        // Merge status into the result
        data.topics.forEach((topic, index) => {
            topic.isResolved = parseInt(status[index].isResolved, 10) === 1;
            // Logs for debugging
            // console.log('[TA-Resolve] Topic', topic.tid, 'isResolved:', topic.isResolved);
        });

        // NOW SORT IF: topics are in category 4 AND user is staff
        // Get the category ID from the first topic (they should all be the same in a category view)
        const cid = parseInt(data.topics[0].cid, 10);
        
        if (cid === 4 && data.uid) {
            // Logs for debugging
            // console.log('[TA-Resolve] Is category 4 and user logged in, checking permissions');
            
            try {
                const isAdmin = await user.isAdministrator(data.uid);
                const isGlobalMod = await user.isGlobalModerator(data.uid);
                const isTA = await groups.isMember(data.uid, 'Teaching Assistants');
                // Logs for debugging
                // console.log('[TA-Resolve] isAdmin:', isAdmin, 'isGlobalMod:', isGlobalMod, 'isTA:', isTA);

                if (isAdmin || isGlobalMod || isTA) {
                    // Logs for debugging
                    // console.log('[TA-Resolve] User is staff - sorting unresolved first');
                    const unresolved = [];
                    const resolved = [];

                    data.topics.forEach((topic) => {
                        if (topic.isResolved) {
                            resolved.push(topic);
                        } else {
                            unresolved.push(topic);
                        }
                    });
                    
                    // Logs for debugging
                    // console.log('[TA-Resolve] Final sort: unresolved count:', unresolved.length, 'resolved count:', resolved.length);
                    data.topics = unresolved.concat(resolved);
                }
            } catch (permErr) {
                // Logs for debugging
                // console.error('[TA-Resolve] Error checking permissions:', permErr.message);
                // Continue without sorting if permission check fails
            }
        }

        return data;
    } catch (err) {
        // Logs for debugging
        // console.error('[TA-Resolve] Error in appendResolveStatusAndSort:', err.message);
        // Return data unmodified if anything fails
        return data;
    }
};

/**
 * Hook: filter:topic.get
 * Purpose: Tell the frontend template if the viewer is a TA
 */
plugin.appendTAPrivileges = async function (data) {
    try {
        // Safety check
        if (!data.topic) {
            return data;
        }

        const uid = data.uid; 
        
        let isAuthorized = false;
        
        if (uid) {
            try {
                const isAdmin = await user.isAdministrator(uid);
                const isGlobalMod = await user.isGlobalModerator(uid);
                const isTA = await groups.isMember(uid, 'Teaching Assistants');
                isAuthorized = isAdmin || isGlobalMod || isTA;
            } catch (permErr) {
                // Logs for debugging
                // console.error('[TA-Resolve] Error checking permissions in appendTAPrivileges:', permErr.message);
                // Continue without authorized status if permission check fails
            }
        }

        // Get the resolved status
        const isResolved = await topics.getTopicField(data.topic.tid, 'isResolved');
        const resolvedBool = parseInt(isResolved, 10) === 1;

        data.topic.isTA = isAuthorized;
        data.topic.isResolved = resolvedBool;

        if (data.topic.posts && Array.isArray(data.topic.posts)) {
            data.topic.posts.forEach(post => {
                post.isTA = isAuthorized;
                post.isResolved = resolvedBool;
            });
        }
        
        return data;
    } catch (err) {
        // Logs for debugging
        // console.error('[TA-Resolve] Error in appendTAPrivileges:', err.message);
        // Return data unmodified if anything fails
        return data;
    }
};

/**
 * Hook: filter:post.tools
 * Add "Support Answer" and "Remove support" to the three-dots menu for admins.
 */
plugin.addSupportAnswerTool = async function (data) {
    if (!data.uid) {
        return data;
    }
    const isAdmin = await user.isAdministrator(data.uid);
    if (!isAdmin) {
        return data;
    }
    const supported = await posts.getPostField(data.pid, 'supportedByInstructor');
    const isSupported = parseInt(supported, 10) === 1;

    if (!isSupported) {
        data.tools.push({
            action: 'post/support-answer',
            icon: 'fa-check-circle',
            html: 'Support Answer',
        });
    } else {
        data.tools.push({
            action: 'post/remove-support',
            icon: 'fa-times-circle',
            html: 'Remove support',
        });
    }
    return data;
};

/**
 * Hook: filter:topics.addPostData
 * Normalize supportedByInstructor for template (boolean-like).
 * Ensures the badge is visible to all viewers, including students.
 * Batch-fetches the field from DB when missing (e.g. cache returned stale post object).
 */
plugin.normalizeSupportedByInstructor = async function (data) {
    if (!data.posts || !Array.isArray(data.posts)) {
        return data;
    }
    const pidsMissing = [];
    data.posts.forEach((post) => {
        if (post && !post.hasOwnProperty('supportedByInstructor')) {
            pidsMissing.push(post.pid);
        }
    });
    if (pidsMissing.length > 0) {
        const fetched = await posts.getPostsFields(pidsMissing, ['supportedByInstructor']);
        const pidToValue = {};
        pidsMissing.forEach((pid, i) => {
            pidToValue[String(pid)] = fetched[i] ? fetched[i].supportedByInstructor : undefined;
        });
        data.posts.forEach((post) => {
            if (post && pidToValue.hasOwnProperty(String(post.pid))) {
                post.supportedByInstructor = pidToValue[String(post.pid)];
            }
        });
    }
    data.posts.forEach((post) => {
        if (post) {
            post.supportedByInstructor = parseInt(post.supportedByInstructor, 10) === 1;
        }
    });
    return data;
};

/**
 * Hook: filter:post.getPostSummaryByPids
 * Normalize supportedByInstructor for summary views (search, recent posts, profile posts).
 */
plugin.normalizeSupportedByInstructorSummary = async function (data) {
    if (data.posts && Array.isArray(data.posts)) {
        data.posts.forEach((post) => {
            if (post) {
                post.supportedByInstructor = parseInt(post.supportedByInstructor, 10) === 1;
            }
        });
    }
    return data;
};

module.exports = plugin;