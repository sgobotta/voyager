<template lang='pug'>
.li-validator(:class='styles'): .li-validator__values
  .li-validator__value.name
    router-link(:to="{ name: 'validator', params: { validator: delegate.id }}")
      img.avatar(v-if="delegate.keybase" :src="delegate.keybase.avatarUrl" width="48" height="48")
      img.avatar(v-else src="~assets/images/validator-icon.svg" width="48" height="48")
      .vert
        .top {{ delegate.description.moniker }}
        .bottom {{ shortAddress(delegate.id)}}
  .li-validator__value.your-votes
    span {{ yourVotes }}
  .li-validator__value.your-rewards
    span {{ yourRewards }}
  .li-validator__break: span
  .li-validator__value.percent_of_vote
    span {{ delegate.percent_of_vote }}
  .li-validator__value.uptime
    // add .green .yellow or .red class to this span to trigger inidication by color
    span {{ uptime }}
  .li-validator__value.commission
    // add .green .yellow or .red class to this span to trigger inidication by color
    span {{ commission }}
  .li-validator__value.slashes
    // add .green .yellow or .red class to this span to trigger inidication by color
    span {{ slashes }}
  template(v-if="!disabled")
    .li-validator__value.checkbox(v-if="committedDelegations[delegate.id]")
      i.material-icons lock
    .li-validator__value.checkbox#remove-from-cart(v-else-if="inCart" @click='rm(delegate)')
      i.material-icons check_box
    .li-validator__value.checkbox#add-to-cart(v-else @click='add(delegate)')
      i.material-icons check_box_outline_blank
  template(v-else)
    .li-validator__value
</template>

<script>
import { mapGetters } from "vuex"
import num from "scripts/num"
import { shortAddress, calculateTokens } from "scripts/common"
export default {
  name: "li-validator",
  props: ["delegate", "disabled"],
  computed: {
    ...mapGetters([
      "shoppingCart",
      "delegates",
      "config",
      "committedDelegations",
      "user"
    ]),
    slashes() {
      return "n/a" //TODO: add slashes
    },
    commission() {
      return "n/a" //TODO: add commission
    },
    uptime() {
      return "n/a" //TODO: add real uptime
    },
    yourRewards() {
      return "n/a"
    },
    yourVotes() {
      return this.num.pretty(
        this.committedDelegations[this.delegate.id]
          ? calculateTokens(
              this.delegate,
              this.committedDelegations[this.delegate.id]
            ).toString()
          : "0"
      )
    },
    styles() {
      let value = ""
      if (this.inCart || this.yourVotes > 0) value += "li-validator-active "
      if (this.delegate.isValidator) value += "li-validator-validator "
      return value
    },
    inCart() {
      return this.shoppingCart.find(c => c.id === this.delegate.id)
    },
    delegateType() {
      return this.delegate.revoked
        ? "Revoked"
        : this.delegate.isValidator
          ? "Validator"
          : "Candidate"
    }
  },
  data: () => ({ num, shortAddress }),
  methods: {
    add(delegate) {
      this.$store.commit("addToCart", delegate)
    },
    rm(delegate) {
      this.$store.commit("removeFromCart", delegate.id)
    }
  }
}
</script>

<style lang="stylus">
@require '~variables'

.li-validator
  border 1px solid var(--bc)
  margin-bottom 1em

  &:nth-of-type(2n-1)
    background var(--app-fg)

  &.li-validator-active
    background var(--app-bg-alpha)

    .li-validator__value i
      color var(--link)

  &:hover
    background var(--hover-bg)

.li-validator__values
  display flex
  height 5rem
  padding 12px 1em
  background-color var(--app-nav)

  & > .li-validator__value:not(:first-of-type) span
    color var(--dim)
    background-color var(--white-fade-1)
    border 1px solid var(--white-fade-2)
    border-radius 4px
    display block
    width 100%
    margin 0 0.5em
    font-size h5
    line-height h5
    text-align right
    padding 4px 4px

    &.green
      color var(--green)
      background-color var(--green-fade-1)
      border 1px solid var(--green-fade-2)

    &.orange
      color var(--orange)
      background-color var(--orange-fade-1)
      border 1px solid var(--orange-fade-2)

    &.red
      color var(--red)
      background-color var(--red-fade-1)
      border 1px solid var(--red-fade-2)

.li-validator__break
  flex 0
  display flex
  align-items center
  min-width 1

  span
    margin 0 0.5em
    width 1px
    background-color var(--white-fade-1)
    height 2rem

.li-validator__value
  flex 1
  display flex
  align-items center
  min-width 0

  &.name
    flex 3

    a
      display flex

      img
        border-radius 100%
        margin-right 1em

      .vert
        display flex
        flex-direction column
        color var(--bright)

        .top
          font-size h5
          padding-bottom 6px

        .bottom
          font-size h6
          color var(--dim)

    .li-validator__icon
      width 1.5rem
      display flex
      align-items center
      justify-content center

      img, span
        height 1rem
        width 1rem

  &.bar
    position relative

    span
      display block
      position absolute
      top 0
      left 0
      z-index z(listItem)
      line-height 3rem
      color var(--txt)

    .bar
      height 1.5rem
      position relative
      left -0.25rem
      background var(--accent-alpha)

  &.checkbox
    justify-content center
    cursor pointer

  span
    white-space nowrap
    overflow hidden
    text-overflow ellipsis
    padding-right 1rem

.sort-by.name
  padding-left 1rem

.sort-by
  .label
    font-size sm
</style>