<template lang="pug">
div(:class='cssClass' @click.self="close()")
  .tm-modal-container
    header.tm-modal-header
      .tm-modal-icon(v-if='icon')
        i.material-icons {{ icon }}
      .tm-modal-title
        slot(name='title')
      .tm-modal-icon.tm-modal-close(@click="close()")
        i.material-icons close
    main.tm-modal-main
      slot
    footer.tm-modal-footer
      slot(name='footer')
</template>

<script>
export default {
  name: `tm-modal`,
  computed: {
    cssClass() {
      let value = `tm-modal`
      if (this.size === `fullscreen` || this.size === `fs`) {
        value += ` tm-modal-fullscreen`
      }
      return value
    }
  },
  props: [`size`, `icon`, `close`]
}
</script>

<style lang="stylus">
@import '~variables'

.tm-modal
  position fixed
  top 0
  left 0
  z-index z(modal)

  width 100vw
  height 100vh
  background hsla(0,0,0,0.5)

  display flex
  justify-content center
  align-items center
  backdrop-filter blur(0.5em)

  b
    font-weight 500
    color var(--bright)

  &.tm-modal-fullscreen
    display flex

.tm-modal-container
  background var(--app-fg)
  box-shadow hsla(0,0,0,0.25) 0 0.25rem 1rem
  display flex
  flex-flow column nowrap
  min-width 20rem
  max-width 40rem

.tm-modal-header
  display flex
  flex-flow row nowrap
  align-items center
  flex 0 0 3rem + 0.0625rem
  padding 2rem 1rem
  background var(--app-nav)

.tm-modal-icon
  height 3rem
  display flex
  align-items center
  justify-content center

  i
    font-size lg
  &.tm-modal-close
    cursor pointer
    i
      color var(--txt)
    &:hover i
      color var(--link)

.tm-modal-icon + .tm-modal-title
  padding-left 0

.tm-modal-title
  flex 1
  font-size h3
  font-weight 500
  color var(--bright)
  padding 0 1rem

.tm-modal-main
  padding 2rem 1rem

.tm-modal-main + .tm-modal-footer
  border-top px solid var(--bc)

.tm-modal-main
  flex 1
  display flex
  flex-flow column
  justify-content center

  .ps-scrollbar-y-rail
    display none

.tm-modal-main p
  margin-bottom 1rem
  padding 0 1rem
  word-wrap break-word
  color var(--txt)

.tm-modal-footer
  padding 1rem

  button
    padding-left 1rem

  &:empty
    display none

.tm-modal-footer > div
  display flex
  justify-content flex-end
</style>
