import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {hasDecisiveCoverageGap, readableCompanySourceIds} from '../markets/research-coverage.ts'
import type {CompanyPacket} from '../markets/types.ts'

type Schema = Record<string, unknown>
const object = (value: unknown) => value as Schema

/** Constrain generation to the same captured IDs that validation accepts. */
export function companyResearchOutputSchema(template: Schema, packet: CompanyPacket): Schema {
  const schema=structuredClone(template), allowed=readableCompanySourceIds(packet)
  schema.$defs={...object(schema.$defs??{}),capturedSourceId:{type:'string',...(allowed.length?{enum:allowed}:{})}}
  const restrictSources=(value: unknown):void=>{
    if(!value || typeof value!=='object')return
    for(const [key,child] of Object.entries(value)){
      if(key==='sourceIds' && child && typeof child==='object'){
        const field=object(child)
        // Shared array definitions are constrained at their definition; adding
        // items beside a $ref is rejected by the native structured-output API.
        if(field.$ref)continue
        field.items={$ref:'#/$defs/capturedSourceId'}
        if(!allowed.length)field.maxItems=0
      } else restrictSources(child)
    }
  }
  restrictSources(schema)
  const research=object(object(schema.properties).research), properties=object(research.properties)
  const advice=object(object(properties.advice).properties)
  const coverage=packet.researchCoverage
  if(!coverage)return schema
  const rows=object(object(object(properties.coverageReview).properties).topics), row=object(rows.items)
  rows.minItems=coverage.topics.length;rows.maxItems=coverage.topics.length
  if(coverage.topics.length)rows.items={anyOf:coverage.topics.map(topic=>{
    const specific=structuredClone(row), fields=object(specific.properties)
    fields.topicId={type:'string',enum:[topic.id]}
    fields.sourceIds=topic.sourceIds.length?{type:'array',items:{type:'string',enum:topic.sourceIds}}:{type:'array',maxItems:0,items:{type:'string'}}
    if(!topic.sourceIds.length)fields.status={type:'string',enum:['unresolved']}
    object(fields.sectionIds).minItems=1;object(fields.investmentImplication).minLength=20
    if(topic.unresolvedQuestions.length || !topic.sourceIds.length)object(fields.limitations).minLength=20
    return specific
  })}
  if(hasDecisiveCoverageGap(coverage)){
    object(object(advice.evidenceSufficiency).properties).value={type:'string',enum:['limited','insufficient']}
    object(object(advice.newEntryStance).properties).value={type:'string',enum:['wait','avoid','undetermined']}
  }
  return schema
}

export async function withCompanyResearchSchema<T>(packet: CompanyPacket, consume: (schemaPath: string)=>Promise<T>):Promise<T>{
  const directory=await mkdtemp(join(tmpdir(),'stratum-company-schema-'))
  try{
    const template=JSON.parse(await readFile(resolve('schemas/company-research-bundle.schema.json'),'utf8'))
    const path=join(directory,'schema.json')
    await writeFile(path,JSON.stringify(companyResearchOutputSchema(template,packet)),{mode:0o600})
    return await consume(path)
  }finally{await rm(directory,{recursive:true,force:true})}
}
