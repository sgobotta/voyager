import setup from "../../../helpers/vuex-setup"
import htmlBeautify from "html-beautify"
import TableValidators from "renderer/components/staking/TableValidators"
import lcdClientMock from "renderer/connectors/lcdClientMock.js"

describe(`TableValidators`, () => {
  let wrapper, store
  let { mount } = setup()

  beforeEach(() => {
    let instance = mount(TableValidators, {
      propsData: { validators: lcdClientMock.candidates }
    })

    wrapper = instance.wrapper
    store = instance.store

    store.commit(`setConnected`, true)
    store.state.user.address = `address1234`
    store.commit(`setAtoms`, 1337)
    wrapper.update()
  })

  it(`has the expected html structure`, async () => {
    // after importing the @tendermint/ui components from modules
    // the perfect scroll plugin needs a $nextTick and a wrapper.update
    // to work properly in the tests (snapshots weren't matching)
    // this has occured across multiple tests
    await wrapper.vm.$nextTick()
    wrapper.update()
    expect(htmlBeautify(wrapper.html())).toMatchSnapshot()
  })

  it(`should sort the delegates by selected property`, () => {
    wrapper.vm.sort.property = `operator_address`
    wrapper.vm.sort.order = `desc`

    expect(
      wrapper.vm.sortedFilteredEnrichedDelegates.map(x => x.operator_address)
    ).toEqual(lcdClientMock.validators)

    wrapper.vm.sort.property = `operator_address`
    wrapper.vm.sort.order = `asc`

    expect(
      wrapper.vm.sortedFilteredEnrichedDelegates.map(x => x.operator_address)
    ).toEqual(lcdClientMock.validators.reverse())
  })

  it(`should filter the delegates`, () => {
    store.commit(`setSearchVisible`, [`delegates`, true])
    store.commit(`setSearchQuery`, [
      `delegates`,
      lcdClientMock.validators[2].substr(20, 26)
    ])
    expect(
      wrapper.vm.sortedFilteredEnrichedDelegates.map(x => x.operator_address)
    ).toEqual([lcdClientMock.validators[2]])
    wrapper.update()
    expect(wrapper.vm.$el).toMatchSnapshot()
    store.commit(`setSearchQuery`, [
      `delegates`,
      lcdClientMock.validators[1].substr(20, 26)
    ])
    expect(
      wrapper.vm.sortedFilteredEnrichedDelegates.map(x => x.operator_address)
    ).toEqual([lcdClientMock.validators[1]])
  })

  it(`should update 'somethingToSearch' when there's nothing to search`, () => {
    expect(wrapper.vm.somethingToSearch).toBe(true)
    wrapper.setProps({ validators: [] })
    expect(wrapper.vm.somethingToSearch).toBe(false)
  })

  it(`should show placeholder if delegates are loading`, () => {
    let { wrapper } = mount(TableValidators, {
      getters: {
        delegates: () => ({
          delegates: [],
          loading: true
        })
      },
      propsData: { validators: [] },
      stubs: { "tm-data-loading": `<data-loading />` }
    })
    expect(wrapper.contains(`data-loading`)).toBe(true)
  })

  it(`should not show search when there is nothing to search`, () => {
    let { wrapper } = mount(TableValidators, {
      getters: {
        delegates: () => ({
          delegates: [],
          loading: true
        })
      },
      propsData: { validators: [] },
      stubs: { "tm-data-loading": `<data-loading />` }
    })
    wrapper.update()

    expect(wrapper.vm.setSearch()).toEqual(false)
  })
})