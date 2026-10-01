import type { MarketThesisWorkspaceData } from '../markets/types.ts'
import type { WorldNode, WorldUpdateProposal } from '../markets/world-thinker-types.ts'

/** Legacy opinions remain labeled assessments, never promoted to independently verified facts. */
export function legacyWorldNodes(workspace: MarketThesisWorkspaceData, existingIds: Set<string>, now: Date): WorldNode[] {
 return workspace.hypotheses.filter(h => !existingIds.has(`legacy-${h.id}`)).map(h => {
  const versions=workspace.theses.filter(t => t.hypothesisId===h.id)
  const lineage={ authority:'legacy-domain', status:'legacy/shadow', hypothesisId:h.id,
   researchVersionId:h.latestResearch?.id ?? null,
   versions:versions.map(t => ({id:t.id,version:t.version,researchVersionId:t.researchVersionId,
    sourceLedger:t.content.sourceLedger, exposures:t.exposures.map(e => ({id:e.id,symbol:e.symbol,entityName:e.entityName,role:e.role,mechanism:e.mechanism,sourceIds:e.sourceIds,verificationStatus:e.verificationStatus})),
    predictions:t.predictions.map(p => ({id:p.id})),
   })) }
  return { id:`legacy-${h.id}`,kind:'theme' as const,title:`Legacy/shadow: ${h.title}`,status: ['archived','rejected'].includes(h.status)?'archived' as const:'monitoring' as const,
   asOf:h.updatedAt,confidence:h.confidence,importance:50,aliases:[h.id],relationships:[],sourceIds:[],
   nextReviewAt:new Date(now.getTime()+30*86400000).toISOString(),summary:`Legacy/shadow assessment: ${h.coreMechanism}`.slice(0,1500),
   claims:[{text:h.coreMechanism,assessment:true,sourceIds:[]},...(h.counterThesis?[{text:`Contrary assessment: ${h.counterThesis}`,assessment:true,sourceIds:[]}]:[])],indicators:[],
   body:`Legacy/shadow import. These are historical analytical assessments, not new verified evidence. Owner investment theses are separate. Original predictions remain with their original resolver.\n\n${JSON.stringify(lineage,null,2)}\n\nOpen questions:\n${h.unresolvedNodes.join('\n')}`,
   changeSummary:'Imported original lineage into the single Git authority; no outcome or confidence promotion.' }
 })
}

export function legacyImportProposal(nodes: WorldNode[], current: WorldNode, baseCommit: string, now: Date): WorldUpdateProposal {
 return {asOf:now.toISOString(),trigger:'manual',baseCommit,orientation:'Consolidate retained legacy analytical history without promoting it.',
  eventClassifications:[],sources:[],upserts:[current,...nodes],archives:[],opportunityLeads:[],
  journal:{title:'Import legacy shadow belief lineage',summary:`Imported ${nodes.length} legacy assessments; original source, version, exposure and prediction identifiers remain readable.`,
   materialChanges:[],beliefChanges:[],scenarioChanges:[],newInvestigations:[],attentionIndicators:[]}}
}
