"use strict"

const assert = require(`assert`)
let { app, BrowserWindow, ipcMain } = require(`electron`)
let fs = require(`fs-extra`)
let { join, relative } = require(`path`)
let childProcess = require(`child_process`)
let semver = require(`semver`)
let Raven = require(`raven`)
let axios = require(`axios`)

let pkg = require(`../../../package.json`)
let addMenu = require(`./menu.js`)
let config = require(`../config.js`)
config.node_lcd = process.env.LCD_URL || config.node_lcd
config.node_rpc = process.env.RPC_URL || config.node_rpc
let LcdClient = require(`../renderer/connectors/lcdClient.js`)
global.config = config // to make the config accessable from renderer

require(`electron-debug`)()

let shuttingDown = false
let mainWindow
let lcdProcess
let streams = []
let connecting = true
let chainId
let booted = false
let expectedGaiaCliVersion

const root = require(`../root.js`)
global.root = root // to make the root accessable from renderer
const networkPath = require(`../network.js`).path

const lcdHome = join(root, `lcd`)
const WIN = /^win/.test(process.platform)
const DEV = process.env.NODE_ENV === `development`
const TEST = process.env.NODE_ENV === `testing`
global.config.development = DEV || TEST
// TODO default logging or default disable logging?
const LOGGING = JSON.parse(process.env.LOGGING || `true`) !== false
const winURL = DEV
  ? `http://localhost:${config.wds_port}`
  : `file://${__dirname}/index.html`
const LCD_PORT = DEV ? config.lcd_port : config.lcd_port_prod
const MOCK =
  process.env.COSMOS_MOCKED !== undefined
    ? JSON.parse(process.env.COSMOS_MOCKED)
    : false
global.config.mocked = MOCK // persist resolved mock setting also in config used by view thread
const gaiaVersion = fs
  .readFileSync(networkPath + `/gaiaversion.txt`)
  .toString()
  .split(`-`)[0]
process.env.GAIA_VERSION = gaiaVersion

let LCD_BINARY_NAME = `gaiacli` + (WIN ? `.exe` : ``)

function log(...args) {
  if (LOGGING) {
    console.log(...args)
  }
}
function logError(...args) {
  if (LOGGING) {
    console.log(...args)
  }
}

function logProcess(process, logPath) {
  fs.ensureFileSync(logPath)
  // Writestreams are blocking fs cleanup in tests, if you get errors, disable logging
  if (LOGGING) {
    let logStream = fs.createWriteStream(logPath, { flags: `a` }) // 'a' means appending (old data will be preserved)
    streams.push(logStream)
    process.stdout.pipe(logStream)
    process.stderr.pipe(logStream)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function handleCrash(error) {
  afterBooted(() => {
    if (mainWindow) {
      mainWindow.webContents.send(`error`, {
        message: error
          ? error.message
            ? error.message
            : error
          : `An unspecified error occurred`
      })
    }
  })
}

function signalNoNodesAvailable() {
  afterBooted(() => {
    mainWindow.webContents.send(`error`, {
      code: `NO_NODES_AVAILABLE`,
      message: `No nodes available to connect to.`
    })
  })
}

async function shutdown() {
  if (shuttingDown) return

  mainWindow = null
  shuttingDown = true

  if (lcdProcess) {
    await stopLCD()
  }

  return Promise.all(
    streams.map(stream => new Promise(resolve => stream.close(resolve)))
  ).then(() => {
    log(`[SHUTDOWN] Voyager has shutdown`)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    minWidth: 320,
    minHeight: 480,
    width: 1024,
    height: 768,
    center: true,
    title: `Cosmos Voyager`,
    darkTheme: true,
    titleBarStyle: `hidden`,
    backgroundColor: `#15182d`,
    webPreferences: { webSecurity: false }
  })
  mainWindow.once(`ready-to-show`, () => {
    setTimeout(() => {
      mainWindow.show()
      if (DEV || JSON.parse(process.env.COSMOS_DEVTOOLS || `false`)) {
        mainWindow.webContents.openDevTools()
      }
      if (DEV) {
        mainWindow.maximize()
      }
    }, 300)
  })

  // start vue app
  mainWindow.loadURL(winURL + `?lcd_port=` + LCD_PORT)

  mainWindow.on(`closed`, shutdown)

  // eslint-disable-next-line no-console
  log(`mainWindow opened`)

  // handle opening external links in OS's browser
  let webContents = mainWindow.webContents
  let handleRedirect = (e, url) => {
    if (url !== webContents.getURL()) {
      e.preventDefault()
      require(`electron`).shell.openExternal(url)
    }
  }
  webContents.on(`will-navigate`, handleRedirect)
  webContents.on(`new-window`, handleRedirect)

  addMenu(mainWindow)
}

function startProcess(name, args, env) {
  let binPath
  if (process.env.BINARY_PATH) {
    binPath = process.env.BINARY_PATH
  } else if (DEV) {
    // in development use the build gaia files from running `yarn build:gaia`
    const osFolderName = (function() {
      switch (process.platform) {
        case `win32`:
          return `windows_amd64`
        case `darwin`:
          return `darwin_amd64`
        case `linux`:
          return `linux_amd64`
      }
    })()
    binPath = join(__dirname, `../../../builds/Gaia`, osFolderName, name)
  } else {
    // in production mode, use binaries packaged with app
    binPath = join(__dirname, `..`, `bin`, name)
  }

  let argString = args.map(arg => JSON.stringify(arg)).join(` `)
  log(`spawning ${binPath} with args "${argString}"`)
  let child
  try {
    child = childProcess.spawn(binPath, args, env)
  } catch (err) {
    log(`Err: Spawning ${name} failed`, err)
    throw err
  }
  child.stdout.on(`data`, data => !shuttingDown && log(`${name}: ${data}`))
  child.stderr.on(`data`, data => !shuttingDown && log(`${name}: ${data}`))
  child.on(
    `exit`,
    code => !shuttingDown && log(`${name} exited with code ${code}`)
  )
  child.on(`error`, async function(err) {
    if (!(shuttingDown && err.code === `ECONNRESET`)) {
      // if we throw errors here, they are not handled by the main process
      let errorMessage = [
        `[Uncaught Exception] Child`,
        name,
        `produced an unhandled exception:`,
        err
      ]
      logError(...errorMessage)
      console.error(...errorMessage) // also output to console for easier debugging
      handleCrash(err)

      Raven.captureException(err)
    }
  })

  // need to kill child processes if main process dies
  process.on(`exit`, () => {
    child.kill()
  })
  return child
}

app.on(`window-all-closed`, () => {
  app.quit()
})

app.on(`activate`, () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on(`ready`, () => createWindow())

// start lcd REST API
async function startLCD(home, nodeURL) {
  assert.equal(
    lcdProcess,
    null,
    `Can't start Gaia Lite because it's already running.  Call StopLCD first.`
  )

  let lcdStarted = false // remember if the lcd has started to toggle the right error handling if it crashes async
  return new Promise(async (resolve, reject) => {
    log(`startLCD`, home)
    let child = startProcess(LCD_BINARY_NAME, [
      `rest-server`,
      `--insecure`,
      `--laddr`,
      `tcp://localhost:${LCD_PORT}`,
      `--home`,
      home,
      `--node`,
      nodeURL,
      `--chain-id`,
      chainId,
      `--trust-node`,
      true
    ])
    logProcess(child, join(home, `lcd.log`))

    child.stderr.on(`data`, error => {
      let errorMessage = `The gaiacli rest-server (LCD) experienced an error:\n${error.toString(
        `utf8`
      )}`.substr(0, 1000)
      lcdStarted
        ? handleCrash(errorMessage) // if fails later
        : reject(errorMessage) // if fails immediatly
    })

    // poll until LCD is started
    let client = LcdClient(axios, `http://localhost:${LCD_PORT}`)
    while (true) {
      try {
        await client.keys.values()
        break // request succeeded
      } catch (err) {
        await sleep(1000)
      }
    }
    lcdStarted = true
    resolve(child)
  })
}

function stopLCD() {
  return new Promise((resolve, reject) => {
    if (!lcdProcess) {
      resolve()
      return
    }
    log(`Stopping the LCD server`)
    try {
      // prevent the exit to signal bad termination warnings
      lcdProcess.removeAllListeners(`exit`)

      lcdProcess.on(`exit`, () => {
        lcdProcess = null
        resolve()
      })

      lcdProcess.kill(`SIGKILL`)
    } catch (err) {
      handleCrash(err)
      reject(`Stopping the LCD resulted in an error: ` + err.message)
    }
  })
}

async function getGaiacliVersion() {
  let child = startProcess(LCD_BINARY_NAME, [`version`])
  let data = await new Promise(resolve => {
    child.stdout.on(`data`, resolve)
  })
  return data.toString(`utf8`).trim()
}

function exists(path) {
  try {
    fs.accessSync(path)
    return true
  } catch (err) {
    if (err.code !== `ENOENT`) throw err
    return false
  }
}

// this function will call the passed in callback when the view is booted
// the purpose is to send events to the view thread only after it is ready to receive those events
// if we don't do this, the view thread misses out on those (i.e. an error that occures before the view is ready)
function afterBooted(cb) {
  // in tests we trigger the booted callback always, this causes those events to be sent twice
  // this is why we skip the callback if the message was sent already
  let sent = false
  ipcMain.on(`booted`, () => {
    cb()
    sent = true
  })
  if (booted && !sent) {
    cb()
  }
}

/*
* log to file
*/
function setupLogging(root) {
  if (!LOGGING) return

  // initialize log file
  let logFilePath = join(root, `main.log`)
  fs.ensureFileSync(logFilePath)
  let mainLog = fs.createWriteStream(logFilePath, { flags: `a` }) // 'a' means appending (old data will be preserved)
  mainLog.write(`${new Date()} Running Cosmos-UI\r\n`)
  // mainLog.write(`${new Date()} Environment: ${JSON.stringify(process.env)}\r\n`) // TODO should be filtered before adding it to the log
  streams.push(mainLog)

  log(`Redirecting console output to logfile`, logFilePath)
  // redirect stdout/err to logfile
  // TODO overwriting console.log sounds like a bad idea, can we find an alternative?
  // eslint-disable-next-line no-func-assign
  log = function(...args) {
    if (DEV) {
      console.log(...args)
    }
    mainLog.write(`main-process: ${args.join(` `)}\r\n`)
  }
  // eslint-disable-next-line no-func-assign
  logError = function(...args) {
    if (DEV) {
      console.error(...args)
    }
    mainLog.write(`main-process: ${args.join(` `)}\r\n`)
  }
}

if (!TEST) {
  process.on(`exit`, shutdown)
  // on uncaught exceptions we wait so the sentry event can be sent
  process.on(`uncaughtException`, async function(err) {
    logError(`[Uncaught Exception]`, err)
    Raven.captureException(err)
    handleCrash(err)
  })
  process.on(`unhandledRejection`, async function(err) {
    logError(`[Unhandled Promise Rejection]`, err)
    Raven.captureException(err)
    handleCrash(err)
  })
}

const eventHandlers = {
  booted: () => {
    log(`View has booted`)
    booted = true
  },

  "error-collection": (event, optin) => {
    Raven.uninstall()
      .config(optin ? config.sentry_dsn : ``, {
        captureUnhandledRejections: false
      })
      .install()
  },

  mocked: value => {
    global.config.mocked = value
  },

  reconnect: () => reconnect(),

  "stop-lcd": () => {
    stopLCD()
  },

  "successful-launch": () => {
    console.log(`[START SUCCESS] Vue app successfuly started`)
  }
}

// handle ipc messages from the renderer process
Object.entries(eventHandlers).forEach(([event, handler]) => {
  ipcMain.on(event, handler)
})

// query version of the used SDK via LCD
async function getNodeVersion(nodeURL) {
  let versionURL = `${nodeURL}/node_version`
  let nodeVersion = await axios
    .get(versionURL, { timeout: 3000 })
    .then(res => res.data)
    .then(fullversion => fullversion.split(`-`)[0])

  return nodeVersion
}

// test an actual node version against the expected one and flag the node if incompatible
async function testNodeVersion(nodeURL, expectedGaiaVersion) {
  let nodeVersion = await getNodeVersion(nodeURL)
  let semverDiff = semver.diff(nodeVersion, expectedGaiaVersion)
  if (semverDiff === `patch` || semverDiff === null) {
    return { compatible: true, nodeVersion }
  }

  return { compatible: false, nodeVersion }
}

// check if our node is reachable and the SDK version is compatible with the local one
async function pickAndConnect() {
  let nodeURL = config.node_lcd
  connecting = true
  try {
    await connect(nodeURL)
  } catch (err) {
    handleCrash(err)
    return
  }

  let compatible, nodeVersion
  try {
    const out = await testNodeVersion(config.node_lcd, expectedGaiaCliVersion)
    compatible = out.compatible
    nodeVersion = out.nodeVersion
  } catch (err) {
    logError(
      `Error in getting node SDK version, assuming node is incompatible. Error:`,
      err
    )
    signalNoNodesAvailable()
    await stopLCD()
    return
  }

  if (!compatible) {
    let message = `Node ${nodeURL} uses SDK version ${nodeVersion} which is incompatible to the version used in Voyager ${expectedGaiaCliVersion}`
    log(message)
    mainWindow.webContents.send(`connection-status`, message)
    signalNoNodesAvailable()
    await stopLCD()
    return
  }

  return nodeURL
}

async function connect() {
  log(`starting gaia rest server with nodeURL ${config.node_lcd}`)
  try {
    lcdProcess = await startLCD(lcdHome, config.node_rpc)
    log(`gaia rest server ready`)

    afterBooted(() => {
      log(`Signaling connected node`)
      mainWindow.webContents.send(`connected`, {
        lcdURL: config.node_lcd,
        rpcURL: config.node_rpc
      })
    })
  } catch (err) {
    throw err
  }

  connecting = false
}

async function reconnect() {
  if (connecting) return
  log(`Starting reconnect`)
  connecting = true

  await stopLCD()

  await pickAndConnect()
}

function checkConsistentConfigDir(
  appVersionPath,
  genesisPath,
  configPath,
  gaiacliVersionPath
) {
  let missingFile =
    (!exists(genesisPath) && genesisPath) ||
    (!exists(appVersionPath) && appVersionPath) ||
    (!exists(configPath) && configPath) ||
    (!exists(gaiacliVersionPath) && gaiacliVersionPath)
  if (missingFile) {
    throw Error(
      `The data directory (${root}) is missing ${relative(root, missingFile)}`
    )
  } else {
    let existingVersion = fs.readFileSync(appVersionPath, `utf8`).trim()
    let semverDiff = semver.diff(existingVersion, pkg.version)
    let compatible = semverDiff !== `major` && semverDiff !== `minor`
    if (compatible) {
      log(`configs are compatible with current app version`)
    } else {
      // TODO: versions of the app with different data formats will need to learn how to
      // migrate old data
      throw Error(`Data was created with an incompatible app version
        data=${existingVersion} app=${pkg.version}`)
    }
  }
}

const checkGaiaCompatibility = async gaiacliVersionPath => {
  // XXX: currently ignores commit hash
  let gaiacliVersion = (await getGaiacliVersion()).split(`-`)[0]

  expectedGaiaCliVersion = fs
    .readFileSync(gaiacliVersionPath, `utf8`)
    .trim()
    .split(`-`)[0]

  log(
    `gaiacli version: "${gaiacliVersion}", expected: "${expectedGaiaCliVersion}"`
  )

  let compatible =
    semver.major(gaiacliVersion) == semver.major(expectedGaiaCliVersion) &&
    semver.minor(gaiacliVersion) == semver.minor(expectedGaiaCliVersion)

  if (!compatible) {
    throw Error(
      `The network you are trying to connect to requires gaia ${expectedGaiaCliVersion}, but the version Voyager is using is ${gaiacliVersion}.${
        DEV
          ? ` Please update "tasks/build/Gaia/COMMIT.sh" with the required version and run "yarn build:gaia".`
          : ``
      }`
    )
  }
}

async function main() {
  // we only enable error collection after users opted in
  Raven.config(``, { captureUnhandledRejections: false }).install()

  let appVersionPath = join(root, `app_version`)
  let genesisPath = join(root, `genesis.json`)
  let configPath = join(root, `config.toml`)
  let gaiacliVersionPath = join(root, `gaiaversion.txt`)

  let rootExists = exists(root)
  await fs.ensureDir(root)

  setupLogging(root)

  if (rootExists) {
    log(`root exists (${root})`)

    // NOTE: when changing this code, always make sure the app can never
    // overwrite/delete existing data without at least backing it up,
    // since it may contain the user's private keys and they might not
    // have written down their seed words.
    // they might get pretty mad if the app deletes their money!

    // check if the existing data came from a compatible app version
    // if not, fail with an error
    checkConsistentConfigDir(
      appVersionPath,
      genesisPath,
      configPath,
      gaiacliVersionPath
    )

    // check to make sure the genesis.json we want to use matches the one
    // we already have. if it has changed, replace it with the new one
    let existingGenesis = fs.readFileSync(genesisPath, `utf8`)
    let genesisJSON = JSON.parse(existingGenesis)
    // skip this check for local testnet
    if (genesisJSON.chain_id !== `local`) {
      let specifiedGenesis = fs.readFileSync(
        join(networkPath, `genesis.json`),
        `utf8`
      )
      if (existingGenesis.trim() !== specifiedGenesis.trim()) {
        fs.copySync(networkPath, root)
        log(
          `genesis.json at "${genesisPath}" was overridden by genesis.json from "${networkPath}"`
        )
      }
    }
  } else {
    log(`initializing data directory (${root})`)
    await fs.ensureDir(root)

    // copy predefined genesis.json and config.toml into root
    fs.accessSync(networkPath) // crash if invalid path
    fs.copySync(networkPath, root)

    fs.writeFileSync(appVersionPath, pkg.version)
  }

  await checkGaiaCompatibility(gaiacliVersionPath)

  // read chainId from genesis.json
  let genesisText = fs.readFileSync(genesisPath, `utf8`)
  let genesis = JSON.parse(genesisText)
  chainId = genesis.chain_id // is set globaly

  // choose one random node to start from
  await pickAndConnect()
}
module.exports = main()
  .catch(err => {
    logError(err)
    handleCrash(err)
  })
  .then(() => ({
    shutdown,
    processes: { lcdProcess },
    eventHandlers
  }))
