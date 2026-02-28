'use strict';

const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const posts = require.main.require('./src/posts');
const groups = require.main.require('./src/groups');
const socketPlugins = require.main.require('./src/socket.io/plugins');

const plugin = {};

/**
 * Initialize plugin - register socket methods
 */
plugin.init = async function (params) {
    socketPlugins.announcementViewers = {};

    /**
     * Log a view when a student opens an announcement
     * Students can only log their own views
     */
    socketPlugins.announcementViewers.logView = async function (socket, data) {
        if (!socket.uid) {
            throw new Error('[[error:not-logged-in]]');
        }

        if (!data || !data.pid) {
            throw new Error('[[error:invalid-data]]');
        }

        const pid = parseInt(data.pid, 10);

        // Check if post exists
        const postExists = await posts.exists(pid);
        if (!postExists) {
            throw new Error('[[error:invalid-data]]');
        }

        // Check if user is a student (not admin/TA)
        // Admins and TAs views should not be logged
        const isAdmin = await user.isAdministrator(socket.uid);
        const isGlobalMod = await user.isGlobalModerator(socket.uid);
        const isTA = await groups.isMember(socket.uid, 'Teaching Assistants');

        if (isAdmin || isGlobalMod || isTA) {
            // Don't log views for staff
            return { logged: false, reason: 'staff-view' };
        }

        // Check if already viewed (prevent duplicates)
        const alreadyViewed = await db.isSortedSetMember(`post:${pid}:viewers`, socket.uid);
        if (alreadyViewed) {
            return { logged: false, reason: 'already-viewed' };
        }

        // Log the view with timestamp
        const timestamp = Date.now();
        await db.sortedSetAdd(`post:${pid}:viewers`, timestamp, socket.uid);

        // Also store in user's viewed posts for potential future use
        await db.sortedSetAdd(`uid:${socket.uid}:viewed_posts`, timestamp, pid);

        return { logged: true, timestamp: timestamp };
    };

    /**
     * Get list of viewers for a post
     * Only accessible by admins and TAs
     */
    socketPlugins.announcementViewers.getViewers = async function (socket, data) {
        if (!socket.uid) {
            throw new Error('[[error:not-logged-in]]');
        }

        if (!data || !data.pid) {
            throw new Error('[[error:invalid-data]]');
        }

        // Check permissions - only admin/TA can view
        const isAdmin = await user.isAdministrator(socket.uid);
        const isGlobalMod = await user.isGlobalModerator(socket.uid);
        const isTA = await groups.isMember(socket.uid, 'Teaching Assistants');

        if (!isAdmin && !isGlobalMod && !isTA) {
            throw new Error('[[error:no-privileges]]');
        }

        const pid = parseInt(data.pid, 10);

        // Check if post exists
        const postExists = await posts.exists(pid);
        if (!postExists) {
            throw new Error('[[error:invalid-data]]');
        }

        // Get all viewers with timestamps
        const viewerData = await db.getSortedSetRangeWithScores(`post:${pid}:viewers`, 0, -1);

        if (!viewerData || viewerData.length === 0) {
            return { viewers: [], count: 0 };
        }

        // Get user details for each viewer
        const uids = viewerData.map(v => v.value);
        const users = await user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture', 'displayname']);

        // Combine user data with timestamps
        const viewers = users.map((userData, index) => {
            if (!userData || !userData.uid) {
                return null; // Handle deleted users
            }
            return {
                uid: userData.uid,
                username: userData.username,
                userslug: userData.userslug,
                displayname: userData.displayname || userData.username,
                picture: userData.picture,
                viewedAt: viewerData[index].score,
            };
        }).filter(v => v !== null); // Remove deleted users

        return {
            viewers: viewers,
            count: viewers.length,
        };
    };

    /**
     * Get viewer count for a post (lightweight version)
     */
    socketPlugins.announcementViewers.getViewerCount = async function (socket, data) {
        if (!socket.uid) {
            throw new Error('[[error:not-logged-in]]');
        }

        if (!data || !data.pid) {
            throw new Error('[[error:invalid-data]]');
        }

        const pid = parseInt(data.pid, 10);
        const count = await db.sortedSetCard(`post:${pid}:viewers`);

        return { count: count || 0 };
    };
};

/**
 * Hook: filter:topic.get
 * Tell the frontend if the user can view the viewers list
 */
plugin.appendViewerPrivileges = async function (data) {
    if (!data.topic) {
        return data;
    }

    const uid = data.uid;
    let canViewViewers = false;

    if (uid) {
        const isAdmin = await user.isAdministrator(uid);
        const isGlobalMod = await user.isGlobalModerator(uid);
        const isTA = await groups.isMember(uid, 'Teaching Assistants');
        canViewViewers = isAdmin || isGlobalMod || isTA;
    }

    data.topic.canViewViewers = canViewViewers;

    return data;
};

module.exports = plugin;