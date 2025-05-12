const appFn = require('./')
const { FULL_SYNC_NOP, FULL_SYNC_PR, ADMIN_REPO } = require('./lib/env')
const { createProbot } = require('probot')

async function performFullSync (appFn, nop) {
  const probot = createProbot()
  probot.log.info(`Starting full sync with NOP=${nop}`)

  try {
    const app = appFn(probot, {})
    const settings = await app.syncInstallation(nop)

    if (settings.errors && settings.errors.length > 0) {
      probot.log.error('Errors occurred during full sync.')
      process.exit(1)
    }

    probot.log.info('Full sync completed successfully.')
  } catch (error) {
    process.stdout.write(`Unexpected error during full sync: ${error}\n`)
    process.exit(1)
  }
}

async function performDryRun (appFn, pr, admin_repo) {
  const probot = createProbot()
  probot.log.info(`Starting dry run with PR=${pr}`)

  try {
    const app = appFn(probot, {})
    const github = await app.auth()
    const app_data = await github.apps.getAuthenticated()
    const pr_data = await github.pulls.get({
      owner: app_data.owner.login,
      repo: admin_repo,
      pull_number: pr
    })
    const cr_context = {
      payload: {
        pr_data
      },
      octokit: github,
      log: probot.log,
    }

    const check_run = await app.createCheckRun(cr_context, null, pr_data.head.sha, null)

    app.receive({
      name: 'check_run',
      payload: {
        action: 'created',
        check_run: check_run
      }
    })

    probot.log.info('Dry run completed successfully.')

  } catch (error) {
    process.stdout.write(`Unexpected error during dry run: ${error}\n`)
    process.exit(1)
  }
}

// Perform a full sync
if (!FULL_SYNC_NOP) {
  performFullSync(appFn, FULL_SYNC_NOP).catch((error) => {
    console.error('Fatal error during full sync:', error)
    process.exit(1)
  })
// Perform a dry run
} else if (FULL_SYNC_PR && FULL_SYNC_NOP) {
  performDryRun(appFn, FULL_SYNC_PR, ADMIN_REPO).catch((error) => {
    console.error('Fatal error during dry run:', error)
    process.exit(1)
  })
}
