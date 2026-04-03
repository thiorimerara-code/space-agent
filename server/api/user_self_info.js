export function get(context) {
  const username = String(context.user?.username || "").trim();
  const userIndex =
    context.watchdog && typeof context.watchdog.getIndex === "function"
      ? context.watchdog.getIndex("user_index")
      : null;
  const groupIndex =
    context.watchdog && typeof context.watchdog.getIndex === "function"
      ? context.watchdog.getIndex("group_index")
      : null;
  const userRecord =
    userIndex && typeof userIndex.getUser === "function" ? userIndex.getUser(username) : null;
  const groups =
    groupIndex && typeof groupIndex.getOrderedGroupsForUser === "function"
      ? groupIndex.getOrderedGroupsForUser(username)
      : [];
  const managedGroups =
    groupIndex && typeof groupIndex.getManagedGroupsForUser === "function"
      ? groupIndex.getManagedGroupsForUser(username)
      : [];
  const isAdmin =
    groupIndex && typeof groupIndex.isUserInGroup === "function"
      ? groupIndex.isUserInGroup(username, "_admin")
      : false;

  return {
    fullName: String(userRecord?.fullName || username),
    groups: Array.isArray(groups) ? groups : [],
    isAdmin,
    managedGroups: Array.isArray(managedGroups) ? managedGroups : [],
    username
  };
}
