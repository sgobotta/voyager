"use strict"

export default ({ node }) => {
  let emptyState = {
    loading: false,
    proposals: {}
  }
  const state = JSON.parse(JSON.stringify(emptyState))

  const mutations = {
    setProposal(state, proposal) {
      state.proposals[proposal.proposal_id] = proposal
    }
  }
  let actions = {
    async reconnected({ state, dispatch }) {
      if (state.loading) {
        await dispatch(`getProposals`)
      }
    },
    resetSessionData({ rootState }) {
      // clear previous account state
      rootState.proposals = JSON.parse(JSON.stringify(emptyState))
    },
    async getProposals({ state, commit, dispatch }) {
      state.loading = true
      let proposals = await node.queryProposals()
      if (proposals.length > 0) {
        proposals.forEach(proposal => {
          let proposalId = Number(proposal.value.proposal_id)
          commit(`setProposal`, proposal.value)
          if (proposal.value.proposal_status !== `DepositPeriod`) {
            dispatch(`getProposalVotes`, proposalId)
          }
          dispatch(`getProposalDeposits`, proposalId)
        })
      }
      state.loading = false
    },
    async submitProposal(
      {
        rootState: { wallet },
        dispatch
      },
      proposal
    ) {
      await dispatch(`sendTx`, {
        type: `submitProposal`,
        proposer: wallet.address,
        proposal_type: proposal.proposal_type,
        title: proposal.title,
        description: proposal.description,
        initial_deposit: proposal.initial_deposit
      })
      setTimeout(async () => {
        dispatch(`getProposals`)
      }, 5000)
    }
  }
  return {
    state,
    actions,
    mutations
  }
}
