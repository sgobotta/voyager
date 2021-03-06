import setup from "../../helpers/vuex-setup"
import b32 from "scripts/b32"

function mockGA() {
  window.analytics = { send: jest.fn() }
}
jest.mock(`renderer/google-analytics.js`, () => mockGA)

let instance = setup()

describe(`Module: User`, () => {
  let store, node
  let accounts = [
    {
      address: `tb1zg69v7yszg69v7yszg69v7yszg69v7ysd8ep6q`,
      name: `ACTIVE_ACCOUNT`,
      password: `1234567890`
    }
  ]

  beforeEach(() => {
    let test = instance.shallow()
    store = test.store
    node = test.node
  })

  it(`should default to signed out state`, () => {
    expect(store.state.user.signedIn).toBe(false)
    expect(store.state.user.password).toBe(null)
    expect(store.state.user.account).toBe(null)
    expect(store.state.user.address).toBe(null)
  })

  it(`should add and remove history correctly`, () => {
    expect(store.state.user.history.length).toBe(0)
    store.commit(`addHistory`, `/`)
    expect(store.state.user.history.length).toBe(1)
    store.commit(`popHistory`)
    expect(store.state.user.history.length).toBe(0)
  })
  it(`should pauseHistory correctly`, () => {
    expect(store.state.user.pauseHistory).toBe(false)
    store.commit(`pauseHistory`, true)
    expect(store.state.user.pauseHistory).toBe(true)
    store.commit(`pauseHistory`, false)
    expect(store.state.user.pauseHistory).toBe(false)
  })

  it(`should set accounts`, () => {
    store.commit(`setAccounts`, accounts)
    expect(store.state.user.accounts).toEqual(accounts)
  })

  it(`should show an error if loading accounts fails`, async () => {
    node.keys.values = () => Promise.reject(`Expected Error`)
    await store.dispatch(`loadAccounts`)
    expect(store.state.notifications[0].title).toBe(`Couldn't read keys`)
  })

  it(`should set atoms`, () => {
    store.commit(`setAtoms`, 42)
    expect(store.state.user.atoms).toBe(42)
  })

  it(`should prepare the signin`, async () => {
    node.keys.values = () => Promise.resolve(accounts)
    await store.dispatch(`showInitialScreen`)
    expect(store.state.config.modals.session.state).toBe(`sign-in`)
    expect(store.state.config.modals.session.active).toBe(true)
  })

  it(`should show a welcome screen if there are no accounts yet`, async () => {
    const previousValues = node.keys.values
    node.keys.values = () => Promise.resolve([])
    await store.dispatch(`showInitialScreen`)
    expect(store.state.config.modals.session.state).toBe(`welcome`)
    expect(store.state.config.modals.session.active).toBe(true)
    node.keys.values = previousValues
  })

  it(`should test if the login works`, async () => {
    node.keys.set = (account, { name, old_password, new_password }) => {
      expect(account).toBe(name)
      expect(old_password).toBe(new_password)
      return true
    }
    let output = await store.dispatch(`testLogin`, {
      account: `default`,
      password: `1234567890`
    })
    expect(output).toBe(true)
  })

  it(`should raise an error if login test fails`, done => {
    node.keys.set = () => Promise.reject(`Expected error`)
    store.dispatch(`testLogin`, {}).catch(() => done())
  })

  it(`should create a seed phrase`, async () => {
    let seed = await store.dispatch(`createSeed`)
    expect(seed).toBeDefined()
    expect(seed.split(` `).length).toBe(24)
  })

  it(`should create a key from a seed phrase`, async () => {
    let seedPhrase = `abc`
    let password = `123`
    let name = `def`
    node.keys.add = jest.fn(node.keys.add)
    let address = await store.dispatch(`createKey`, {
      seedPhrase,
      password,
      name
    })
    expect(node.keys.add).toHaveBeenCalledWith({
      seed: seedPhrase,
      password,
      name
    })
    b32.decode(address)
    // initialize wallet
    expect(store.state.wallet.address).toBe(address)
  })

  it(`should delete a key`, async () => {
    let password = `123`
    let name = `def`
    node.keys.delete = jest.fn()
    await store.dispatch(`deleteKey`, { password, name })
    expect(node.keys.delete).toHaveBeenCalledWith(name, { password, name })
  })

  it(`should sign in`, async () => {
    let password = `123`
    let account = `def`
    node.keys.get = jest.fn(() =>
      Promise.resolve({ address: `tb1wdhk6efqv9jxgun9wdesd6m8k8` })
    )
    await store.dispatch(`signIn`, { password, account })
    expect(node.keys.get).toHaveBeenCalledWith(account)
    expect(store.state.user.signedIn).toBe(true)

    // initialize wallet
    expect(store.state.wallet.address).toEqual(`tb1wdhk6efqv9jxgun9wdesd6m8k8`)

    // hide login
    expect(store.state.config.modals.session.active).toBe(false)
  })

  it(`should sign out`, async () => {
    let password = `123`
    let account = `def`
    await store.dispatch(`signIn`, { password, account })
    store.dispatch(`signOut`)
    expect(store.state.user.account).toBe(null)
    expect(store.state.user.password).toBe(null)
    expect(store.state.user.signedIn).toBe(false)

    // hide login
    expect(store.state.config.modals.session.active).toBe(true)
  })

  it(`should set the error collection opt in`, async () => {
    const Raven = require(`raven-js`)
    const ravenSpy = jest.spyOn(Raven, `config`)
    store.dispatch(`setErrorCollection`, { account: `abc`, optin: true })
    expect(store.state.user.errorCollection).toBe(true)
    expect(window.analytics).toBeTruthy()
    expect(ravenSpy).toHaveBeenCalled()
    expect(ravenSpy).not.toHaveBeenCalledWith(``)
    expect(ravenSpy.mock.calls).toMatchSnapshot()

    store.dispatch(`setErrorCollection`, { account: `abc`, optin: false })
    expect(store.state.user.errorCollection).toBe(false)
    expect(window.analytics).toBeFalsy()
    expect(ravenSpy).toHaveBeenCalledWith(``)
  })

  it(`should persist the error collection opt in`, () => {
    let localStorageSpy = jest.spyOn(localStorage, `setItem`)
    store.dispatch(`setErrorCollection`, { account: `abc`, optin: true })

    expect(localStorageSpy).toHaveBeenCalledWith(
      `voyager_error_collection_abc`,
      true
    )
  })

  it(`should load the persistet error collection opt in`, () => {
    let localStorageSpy = jest.spyOn(localStorage, `getItem`)
    store.dispatch(`setErrorCollection`, { account: `abc`, optin: true })
    store.state.user.errorCollection = false
    store.dispatch(`loadErrorCollection`, `abc`)
    expect(store.state.user.errorCollection).toBe(true)
    expect(localStorageSpy).toHaveBeenCalledWith(`voyager_error_collection_abc`)

    store.dispatch(`setErrorCollection`, { account: `abc`, optin: false })
    store.state.user.errorCollection = true
    store.dispatch(`loadErrorCollection`, `abc`)
    expect(store.state.user.errorCollection).toBe(false)
  })
  it(`should reload accounts on reconnect as this could be triggered by a switch from a mocked connection`, async () => {
    store.state.user.accounts = []
    await store.dispatch(`reconnected`)
    expect(store.state.user.accounts.length).toBeGreaterThan(0)
  })

  it(`should not set error collection if in development mode`, async () => {
    const Raven = require(`raven-js`)
    const ravenSpy = jest.spyOn(Raven, `config`)
    jest.doMock(`electron`, () => ({
      ipcRenderer: { send: jest.fn() },
      remote: {
        getGlobal(name) {
          if (name === `config`)
            return {
              development: true
            }
        }
      }
    }))

    // we need to force resetting of the store modules to enable the new electron mock
    jest.resetModules()
    let setup = require(`../../helpers/vuex-setup`).default
    let instance = setup()
    let test = instance.shallow()
    store = test.store
    node = test.node

    ravenSpy.mockClear()
    store.dispatch(`setErrorCollection`, { account: `abc`, optin: true })
    expect(store.state.user.errorCollection).toBe(false)
    expect(window.analytics).toBeFalsy()
    expect(ravenSpy).not.toHaveBeenCalled()
  })
})
