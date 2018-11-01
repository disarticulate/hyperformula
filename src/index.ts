import {GraphBuilder, Sheet} from "./GraphBuilder";
import {CellVertex, FormulaCellVertex, ValueCellVertex, Vertex} from "./Vertex";
import {Graph} from "./Graph";
import {isFormula} from './parser/ParserWithCaching'
import {Interpreter} from "./interpreter/Interpreter";
import {StatType, Statistics} from "./statistics/Statistics";
import {AddressMapping} from "./AddressMapping"
import {CellAddress, SimpleCellAddress, CellValue, cellAddressFromString, absoluteCellAddress} from "./Cell";

export class HandsOnEngine {
  private addressMapping: AddressMapping = new AddressMapping()
  private graph: Graph<Vertex> = new Graph()
  private sortedVertices: Array<Vertex> = []
  private interpreter: Interpreter = new Interpreter(this.addressMapping)
  private stats : Statistics = new Statistics()

  loadSheet(sheet: Sheet) {
    this.stats.reset()
    this.stats.start(StatType.OVERALL)

    const graphBuilder = new GraphBuilder(this.graph, this.addressMapping, this.stats)

    this.stats.measure(StatType.GRAPH_BUILD, () => {
      graphBuilder.buildGraph(sheet)
    })

    this.stats.measure(StatType.TOP_SORT, () => {
      this.sortedVertices = this.graph.topologicalSort()
    })

    this.stats.measure(StatType.EVALUATION, () => {
      this.recomputeFormulas()
    })

    this.stats.end(StatType.OVERALL)
  }

  getCellValue(stringAddress: string): CellValue {
    const address = cellAddressFromString(stringAddress, absoluteCellAddress(0, 0))
    const vertex = this.addressMapping.getCell(address)!
    return vertex.getCellValue()
  }

  getStats() {
    return this.stats.snapshot()
  }

  setCellContent(stringAddress: string, newCellContent: string) {
    const address = cellAddressFromString(stringAddress, absoluteCellAddress(0, 0))
    const vertex = this.addressMapping.getCell(address)!
    if (vertex instanceof ValueCellVertex && !isFormula(newCellContent)) {
      if (!isNaN(Number(newCellContent))) {
        vertex.setCellValue(Number(newCellContent))
      } else {
        vertex.setCellValue(newCellContent)
      }
    } else {
      throw Error('Changes to cells other than simple values not supported')
    }

    this.recomputeFormulas()
  }

  recomputeFormulas() {
    this.sortedVertices.forEach((vertex: Vertex) => {
      if (vertex instanceof FormulaCellVertex) {
        const address = vertex.getAddress()
        const formula = vertex.getFormula()
        const cellValue = this.interpreter.computeFormula(formula, address)
        vertex.setCellValue(cellValue)
      }
    })
  }
}
