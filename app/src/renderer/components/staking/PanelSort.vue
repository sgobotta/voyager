<template lang="pug">
.panel-sort: .panel-sort-container: .sort-by(
  v-for="(property, i) in properties",
  @click="orderBy(property.value, $event)",
  :class="property.class")
  .label(v-tooltip.top="property.tooltip" v-if="i !== 0")
    .label-text {{ property.title }}
</template>

<script>
export default {
  name: `panel-sort`,
  methods: {
    orderBy(property) {
      let sortBys = this.$el.querySelectorAll(`.sort-by`)
      sortBys.forEach(el => el.classList.remove(`active`, `desc`, `asc`))
      let index = this.properties.findIndex(p => p.value === property)
      let el = sortBys[index]

      if (this.sort.property === property) {
        if (this.sort.order === `asc`) {
          this.sort.order = `desc`
        } else {
          this.sort.order = `asc`
        }
      } else {
        this.sort.property = property
      }
      if (this.sort.order === `asc`) {
        el.classList.add(`asc`)
      } else {
        el.classList.add(`desc`)
      }
      el.classList.add(`active`)
    }
  },
  props: [`sort`, `properties`]
}
</script>

<style lang="stylus">
@require '~variables'

.panel-sort-container
  display flex
  height 2rem
  padding 0 1rem
.sort-by
  flex 1
  cursor pointer
  user-select none
  display flex
  align-items center
  position relative
  min-width 0
  &.asc .label .label-text:after
    content '\f0d8'
  &:nth-of-type(4)
    padding-left 1em
  .label
    display inline-block
    margin auto
    font-size sm
    .label-text
      display: inline
      color var(--link)
      white-space nowrap
      text-overflow ellipsis
      overflow hidden
      &:after
        content '\f0d7'
        display inline-block
        font-family FontAwesome
        color var(--dim)
        padding-left 0.3rem
  .name
    padding-left 1rem

  &.active
    .label-text
      color var(--tertiary)
      &:after
        color var(--tertiary)

  &.name
    flex 3.5

  &.action
    flex 1

  &.hidden
    visibility hidden

@media screen and (max-width: 768px)
  .sort-by
    &.id
      display none
</style>
