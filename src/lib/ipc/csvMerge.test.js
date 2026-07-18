import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { mergeIpcCsvFiles } from './csvMerge'

const oldDiagrams = `branch,group,group_name,subgroup,diagram_title,part_count,source_url,image_url
body_chassis_44V,54,54,091,HEADLAMP CABLE HARNESS,2,https://source/54,https://image/54.png
`

const newDiagrams = `branch,group,group_name,subgroup,diagram_title,part_count,source_url,image_url
body_chassis_44V,54,54,091,HEADLAMP CABLE HARNESS,2,https://source/54,https://image/54.png
body_chassis_44V,67,67,015,WINDSHIELD,1,https://source/67,https://image/67.png
`

const oldParts = `vin,model_code,engine_code,gearbox_code,branch,catalog_group,group_name,subgroup,diagram_title,item_no,part_number,replacement_numbers,quantity,name,usage,remarks,source_url,diagram_image_url,price_url
VIN1,202.018,111.920,717.416,body_chassis_44V,54,54,091,HEADLAMP CABLE HARNESS,10,A0085453728,,1,CLUTCH WINDSHIELD WASHER PUMP;2-POLE,,,https://source/54,https://image/54.png,https://price/A0085453728
`

const newParts = `vin,model_code,engine_code,gearbox_code,branch,catalog_group,group_name,subgroup,diagram_title,item_no,part_number,replacement_numbers,quantity,name,usage,remarks,source_url,diagram_image_url,price_url
VIN1,202.018,111.920,717.416,body_chassis_44V,54,54,091,HEADLAMP CABLE HARNESS,10,A0085453728,,1,CLUTCH WINDSHIELD WASHER PUMP;2-POLE,,,https://source/54,https://image/54.png,https://price/A0085453728
VIN1,202.018,111.920,717.416,body_chassis_44V,67,67,015,WINDSHIELD,10,A2026700100,,1,WINDSHIELD,LAMINATED,,https://source/67,https://image/67.png,https://price/A2026700100
`

describe('mergeIpcCsvFiles', () => {
  it('combines old and recovered IPC CSVs while de-duping stable rows', () => {
    const result = mergeIpcCsvFiles([
      { diagramsCsv: oldDiagrams, partsCsv: oldParts },
      { diagramsCsv: newDiagrams, partsCsv: newParts },
    ])

    expect(result.summary).toEqual({
      inputDiagramRows: 3,
      inputPartRows: 3,
      outputDiagramRows: 2,
      outputPartRows: 2,
    })
    expect(result.diagramsCsv).toContain('body_chassis_44V,67,67,015,WINDSHIELD')
    expect(result.partsCsv).toContain('A2026700100')
    expect(parseCsv(result.partsCsv).filter(row => row.part_number === 'A0085453728')).toHaveLength(1)
  })
})
