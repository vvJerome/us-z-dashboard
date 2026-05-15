## 8-Hour Session Report

### Implementation
- Set up the project's internal guidelines so the AI knows exactly what to build and how to behave
- Documented every major decision made so far so the team doesn't revisit them later
- Added hard rules — no file gets too long, no repeated work, no guessing
- Wrote the project README and set up what files to ignore in version control
- Built the skeleton that connects all the moving parts — the database, the job runner, the web server, the file storage
- Wired the existing scraper (us-z-3) so it can be launched automatically from the dashboard as an isolated job
- Set up automated image builds so code changes go live without manual steps

### Testing
- Nothing tested yet — infrastructure only this session
- Next — spin everything up locally and confirm all services start cleanly
- Then — run a real file through the scraper end-to-end and confirm the output lands where expected

### Monitoring
- Update universal scraper stats (Alpha, Jerome)

### Up Next
- Build the API layer — receives uploads, triggers jobs, tracks status, serves results
- Build the database schema — jobs table, users table
- Build the dashboard — file upload, job list, live status, log viewer, download
- Full end-to-end test with a real input file
- Deploy to the server
