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

async function performDryRun (appFn, pr, adminRepo) {
  const probot = createProbot()
  probot.log.info(`Starting dry run with PR=${pr}`)

  try {
    const app = appFn(probot, {})
    const github = await probot.auth()

    const installations = await github.paginate(
      github.apps.listInstallations.endpoint.merge({ per_page: 100 })
    )

    if (installations.length > 0) {
      const installation = installations[0]
      const github = await probot.auth(installation.id)
      const pullRequest = await github.pulls.get({
        owner: installation.account.login,
        repo: adminRepo,
        pull_number: pr
      })
      const crContext = {
        payload: {
          repository: pullRequest.data.head.repo
        },
        octokit: github,
        log: probot.log
      }

      const checkRun = await app.createCheckRun(crContext, null, pullRequest.data.head.sha, null)

      const checkSuite = await github.request('GET /repos/{owner}/{repo}/check-suites/{check_suite_id}', {
        owner: installation.account.login,
        repo: adminRepo,
        check_suite_id: checkRun.data.check_suite.id,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })

      checkRun.data.check_suite = checkSuite.data

      await app.runTheChecks({
        payload: {
          repository: pullRequest.data.head.repo,
          check_run: checkRun.data
        },
        octokit: github,
        repo: () => { return { repo: adminRepo, owner: installation.account.login } }
      })
    }

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
