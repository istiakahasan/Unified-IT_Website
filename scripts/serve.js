/**
 * Unified Cloud Server Entrypoint (`npm start` or `node scripts/serve.js [port]`)
 * Boots the static file server and the Partner Program backend APIs.
 */
import('../server/server.mjs').then(({ createServer }) => {
  const PORT = Number(process.argv[2] || process.env.PORT || 3000);
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Unified Cloud Platform running at http://localhost:${PORT}`);
    console.log(`- Partner Program: http://localhost:${PORT}/partners`);
    console.log(`- Partner Dashboard: http://localhost:${PORT}/partner/dashboard`);
    console.log(`- Admin Portal: http://localhost:${PORT}/admin/partners`);
  });
}).catch(err => {
  console.error('[Server Boot Error]', err);
  process.exit(1);
});
