import { describe, it, expect } from 'vitest'
import { parseCsv } from './csv'
import { diagramKey, buildIpcImport, searchTextForPart } from './importMapping'

const diagramsCsv = `branch,group,group_name,subgroup,diagram_title,part_count,source_url,image_url
body_chassis_44V,24,24,015,ENGINE SUSPENSION,41,https://source.example/diagram,https://img.example/diagram.png
body_chassis_44V,26,26,060,"FLOOR SHIFT,AUTOMATIC TRANSMISSION",44,https://source.example/shift,https://img.example/shift.png
`

const partsCsv = `vin,model_code,engine_code,gearbox_code,branch,catalog_group,group_name,subgroup,diagram_title,item_no,part_number,replacement_numbers,quantity,name,usage,remarks,source_url,diagram_image_url,price_url
ADB2020186F450004,202.018,111.920,717.416,body_chassis_44V,24,24,015,ENGINE SUSPENSION,5,A2022401617,,1,ENGINE MOUNTING FRONT LEFT,,,https://source.example/diagram,https://img.example/diagram.png,https://price.example/A2022401617
ADB2020186F450004,202.018,111.920,717.416,body_chassis_44V,26,26,060,"FLOOR SHIFT,AUTOMATIC TRANSMISSION",10,A2022600109,A2022600209,-,SHIFT LEVER,"423: 5 SPEED AUTOMATIC",M 6X20,https://source.example/shift,https://img.example/shift.png,https://price.example/A2022600109
`

describe('parseCsv', () => {
  it('handles quoted commas and empty fields', () => {
    const rows = parseCsv(diagramsCsv)
    expect(rows).toHaveLength(2)
    expect(rows[1].diagram_title).toBe('FLOOR SHIFT,AUTOMATIC TRANSMISSION')
  })

  it('rejects unterminated quoted fields', () => {
    expect(() => parseCsv('name,description\npart,"missing end')).toThrow('Malformed CSV: unterminated quoted field')
  })
})

describe('diagramKey', () => {
  it('uses branch, group, and subgroup', () => {
    expect(diagramKey({ branch: 'body', catalog_group: '24', subgroup: '015' })).toBe('body|24|015')
  })
})

describe('buildIpcImport', () => {
  it('normalizes catalog, diagram, and part rows', () => {
    const result = buildIpcImport(parseCsv(diagramsCsv), parseCsv(partsCsv), {
      vehicleId: 'vehicle-1',
      userId: 'user-1',
      sourceName: 'ILcats',
      sourceFilePrefix: 'ilcats-ADB2020186F450004',
    })
    expect(result.catalog).toMatchObject({
      vehicle_id: 'vehicle-1',
      user_id: 'user-1',
      vin: 'ADB2020186F450004',
      model_code: '202.018',
      engine_code: '111.920',
      gearbox_code: '717.416',
    })
    expect(result.diagrams).toHaveLength(2)
    expect(result.parts).toHaveLength(2)
    expect(result.parts[0]).toMatchObject({
      part_number: 'A2022401617',
      name: 'ENGINE MOUNTING FRONT LEFT',
      catalog_group: '24',
      subgroup: '015',
    })
  })

  it('rejects mixed VIN input', () => {
    const rows = parseCsv(partsCsv)
    rows[1].vin = 'DIFFERENT'
    expect(() => buildIpcImport(parseCsv(diagramsCsv), rows, {
      vehicleId: 'vehicle-1',
      userId: 'user-1',
      sourceName: 'ILcats',
      sourceFilePrefix: 'mixed',
    })).toThrow('IPC parts file contains multiple VINs')
  })

  it('rejects a blank VIN in any part row', () => {
    const rows = parseCsv(partsCsv)
    rows[1].vin = '  '
    expect(() => buildIpcImport(parseCsv(diagramsCsv), rows, {
      vehicleId: 'vehicle-1',
      userId: 'user-1',
      sourceName: 'ILcats',
      sourceFilePrefix: 'blank-vin',
    })).toThrow('IPC parts file contains a blank VIN')
  })
})

describe('searchTextForPart', () => {
  it('includes part number, replacement number, name, usage, and remarks', () => {
    const text = searchTextForPart({
      part_number: 'A2022600109',
      replacement_numbers: 'A2022600209',
      name: 'SHIFT LEVER',
      usage: 'AUTOMATIC',
      remarks: 'M 6X20',
    })
    expect(text).toContain('a2022600109')
    expect(text).toContain('a2022600209')
    expect(text).toContain('shift lever')
    expect(text).toContain('automatic')
    expect(text).toContain('m 6x20')
  })
})
