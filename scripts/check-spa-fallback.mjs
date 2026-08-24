const baseUrl = process.argv[2] ?? process.env.APPLYMATE_HOSTING_BASE_URL;

if (!baseUrl) {
  console.error("Usage: npm run hosting:spa:check -- https://example.com");
  process.exitCode = 2;
} else {
  const routes = ["/app", "/app/account", "/app/jobs/new", "/legal", "/support"];
  const results = await Promise.all(routes.map(async (route) => {
    const response = await fetch(new URL(route, baseUrl), {
      headers: { "cache-control": "no-cache" },
      redirect: "manual",
    });
    const body = await response.text();
    return {
      route,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      isSpaEntry: body.includes("<title>ApplyMate · 投了吗</title>") &&
        body.includes('<div id="root"></div>'),
    };
  }));

  for (const result of results) {
    console.log(
      `${result.route} status=${result.status} spaEntry=${String(result.isSpaEntry)}`,
    );
  }

  const failures = results.filter((result) =>
    ![200, 404].includes(result.status) ||
    !result.contentType.includes("text/html") ||
    !result.isSpaEntry
  );
  if (failures.length > 0) {
    console.error(`SPA fallback failed for ${failures.length} route(s).`);
    process.exitCode = 1;
  } else if (results.some((result) => result.status === 404)) {
    console.warn(
      "CloudBase preserved the origin 404 status while serving index.html; BrowserRouter refresh is functional.",
    );
  }
}
