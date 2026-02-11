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
 * Auto-approve posts created by admins
 * Hook: filter:post.create
 */
plugin.autoApproveAdminPosts = async function (data) {
    if (!data.post || !data.post.uid) {
        return data;
    }
    
    try {
        const isAdmin = await user.isAdministrator(data.post.uid);
        if (isAdmin) {
            // Auto-approve the post
            await posts.setPostField(data.post.pid, 'supportedByInstructor', 1);
            await posts.setPostField(data.post.pid, 'supportedByInstructorUid', data.post.uid);
            await posts.setPostField(data.post.pid, 'supportedByInstructorTime', Date.now());
            
            // Update the data object so the frontend sees this
            data.post.supportedByInstructor = 1;
            data.post.supportedByInstructorUid = data.post.uid;
            data.post.supportedByInstructorTime = Date.now();
        }
    } catch (err) {
        // Log error but don't fail the post creation
        console.error('[TA-Resolve] Error auto-approving admin post:', err.message);
    }
    
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
        const isAdmin = await user.isAdministrator(socket.uid);
        if (!isAdmin) {
            throw new Error('[[error:no-privileges]]');
        }
        if (!data || !data.pid) {
            throw new Error('[[error:invalid-data]]');
        }
        const value = data.remove ? 0 : 1;
        const postData = await posts.getPostData(data.pid);
        
        // Set the approval status
        await posts.setPostField(data.pid, 'supportedByInstructor', value);
        
        // Track the approver and timestamp
        if (value === 1) {
            await posts.setPostField(data.pid, 'supportedByInstructorUid', socket.uid);
            await posts.setPostField(data.pid, 'supportedByInstructorTime', Date.now());
            
            // Send notification to post author
            const notifications = require.main.require('./src/notifications');
            const topicTitle = (await topics.getTopicField(postData.tid, 'title')) || '';
            const approverName = await user.getUserField(socket.uid, 'username');
            
            // Create notification with template formatting
            const notifData = {
                type: 'post-approved',
                bodyShort: `<strong>${approverName}</strong> marked your post as Supported by Instructor in <strong>${topicTitle}</strong>.`,
                bodyLong: '',
                nid: `approval:${data.pid}:${socket.uid}`,
                pid: data.pid,
                tid: postData.tid,
                from: socket.uid,
                to: postData.uid,
                path: `/post/${data.pid}`,
            };
            
            const createdNotif = await notifications.create(notifData);
            if (createdNotif) {
                await notifications.push(createdNotif, [postData.uid]);
            }
        } else {
            // Clear the approver info when removing support
            await posts.setPostField(data.pid, 'supportedByInstructorUid', null);
            await posts.setPostField(data.pid, 'supportedByInstructorTime', null);
        }
        
        return { 
            supportedByInstructor: value,
            supportedByInstructorUid: value ? socket.uid : null,
            supportedByInstructorTime: value ? Date.now() : null,
        };
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
        if (!data.topics || !Array.isArray(data.topics) || !data.topics.length) {
            return data;
        }

        // Fetch isResolved status for all topics in the view
        const tids = data.topics.map(t => t && t.tid).filter(Boolean);
        if (!tids.length) {
            return data;
        }

        const status = await topics.getTopicsFields(tids, ['isResolved']);
        
        // Merge status into the result
        data.topics.forEach((topic, index) => {
            if (topic && status[index]) {
                topic.isResolved = parseInt(status[index].isResolved, 10) === 1;
            }
        });

        // OPTIONAL: Sort only if explicitly in category 4 AND user is staff
        // Check safely before accessing first element
        if (data.topics.length > 0 && data.topics[0] && data.topics[0].cid) {
            const cid = parseInt(data.topics[0].cid, 10);
            
            if (cid === 4 && data.uid && parseInt(data.uid, 10) > 0) {
                try {
                    const isAdmin = await user.isAdministrator(data.uid);
                    const isGlobalMod = await user.isGlobalModerator(data.uid);
                    const isTA = await groups.isMember(data.uid, 'Teaching Assistants');

                    if (isAdmin || isGlobalMod || isTA) {
                        const unresolved = [];
                        const resolved = [];

                        data.topics.forEach((topic) => {
                            if (topic && topic.isResolved) {
                                resolved.push(topic);
                            } else if (topic) {
                                unresolved.push(topic);
                            }
                        });
                        
                        // Only reassign if we actually have items
                        if (unresolved.length > 0 || resolved.length > 0) {
                            data.topics = unresolved.concat(resolved);
                        }
                    }
                } catch (permErr) {
                    // Silently continue without sorting if permission check fails
                }
            }
        }

        return data;
    } catch (err) {
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
    try {
        if (!data.uid || !data.pid) {
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
    } catch (err) {
        // Silently fail and return data unmodified
        return data;
    }
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
    
    // Collect pids that are missing the fields we need
    const pidsMissing = [];
    data.posts.forEach((post) => {
        if (post && (!post.hasOwnProperty('supportedByInstructor') || 
                     !post.hasOwnProperty('supportedByInstructorUid') ||
                     !post.hasOwnProperty('supportedByInstructorTime'))) {
            pidsMissing.push(post.pid);
        }
    });
    
    if (pidsMissing.length > 0) {
        const fetched = await posts.getPostsFields(pidsMissing, [
            'supportedByInstructor', 
            'supportedByInstructorUid', 
            'supportedByInstructorTime'
        ]);
        const pidToValue = {};
        pidsMissing.forEach((pid, i) => {
            pidToValue[String(pid)] = fetched[i] || {};
        });
        data.posts.forEach((post) => {
            if (post && pidToValue.hasOwnProperty(String(post.pid))) {
                post.supportedByInstructor = parseInt(pidToValue[String(post.pid)].supportedByInstructor, 10) === 1;
                post.supportedByInstructorUid = pidToValue[String(post.pid)].supportedByInstructorUid;
                post.supportedByInstructorTime = pidToValue[String(post.pid)].supportedByInstructorTime;
            }
        });
    }
    
    // Normalize boolean values for the template
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
                // Keep the approval tracking fields
                // supportedByInstructorUid and supportedByInstructorTime are already present if set
            }
        });
    }
    return data;
};

module.exports = plugin;