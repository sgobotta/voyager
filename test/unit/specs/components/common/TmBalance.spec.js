import setup from "../../../helpers/vuex-setup"
import htmlBeautify from "html-beautify"
import TmBalance from "common/TmBalance"

describe(`TmBalance`, () => {
  let wrapper
  let { mount } = setup()

  beforeEach(() => {
    let instance = mount(TmBalance, {
      getters: {
        user: () => {
          return {
            atoms: 123,
            address: `useraddress16876876876876876786876876876876876`
          }
        },
        totalAtoms: () => {
          return 321
        }
      }
    })
    wrapper = instance.wrapper
    wrapper.update()
  })

  it(`has the expected html structure before adding props`, () => {
    expect(htmlBeautify(wrapper.html())).toMatchSnapshot()
  })

  it(`shows correct stats depending on props`, () => {
    expect(wrapper.contains(`.unbonded-atoms`)).toBe(true)

    expect(wrapper.contains(`.total-earnings`)).toBe(false)
    wrapper.setProps({ totalEarnings: 1337 })
    wrapper.update()
    expect(wrapper.contains(`.total-earnings`)).toBe(true)

    expect(wrapper.contains(`.total-rewards`)).toBe(false)
    wrapper.setProps({ totalRewards: 1337 })
    wrapper.update()
    expect(wrapper.contains(`.total-rewards`)).toBe(true)

    expect(htmlBeautify(wrapper.html())).toMatchSnapshot()
  })
})
