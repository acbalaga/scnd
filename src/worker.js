// SCND Worker. Static assets are served before this script runs; it only sees
// paths that are not files in /public, and passes them straight through.
// It holds no state, calls nothing upstream, and never logs or stores anything.
// (The spike proxies /api/pvgis and /api/gsa were removed in task 8; see git history.)

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
