"use strict"

export default ({ node }) => {
  const emptyState = {
    validators: [],
    loading: false,
    validatorHash: null
  }
  let state = JSON.parse(JSON.stringify(emptyState))

  const mutations = {
    setValidators(state, validators) {
      state.validators = validators
    },
    setValidatorHash(state, validatorHash) {
      state.validatorHash = validatorHash
    }
  }

  const actions = {
    reconnected({ state, dispatch }) {
      if (state.loading) {
        dispatch(`getValidators`)
      }
    },
    resetSessionData({ rootState }) {
      // clear previous account state
      rootState.validators = JSON.parse(JSON.stringify(emptyState))
    },
    async getValidators({ state, commit }) {
      state.loading = true
      try {
        let validators = (await node.getValidatorSet()).validators
        commit(`setValidators`, validators)
      } catch (err) {
        commit(`notifyError`, {
          title: `Error fetching validator set`,
          body: err.message
        })
      }
      state.loading = false
    },
    async maybeUpdateValidators({ state, commit, dispatch }, header) {
      let validatorHash = header.validators_hash
      if (validatorHash === state.validatorHash) return
      commit(`setValidatorHash`, validatorHash)
      await dispatch(`getValidators`)
    }
  }

  return {
    state,
    mutations,
    actions
  }
}
