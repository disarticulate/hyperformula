import {cellError, CellValue, ErrorType, getAbsoluteAddress, isCellError, SimpleCellAddress} from '../Cell'
import {Config} from '../Config'
import {
  dateNumberToMonthNumber,
  dateNumberToYearNumber,
  dateNumebrToStringFormat,
  stringToDateNumber,
  toDateNumber,
} from '../Date'
import {split} from '../generatorUtils'
import {Graph} from '../Graph'
import {findSmallerRange, generateCellsFromRangeGenerator} from '../GraphBuilder'
import {IAddressMapping} from '../IAddressMapping'
import {Ast, AstNodeType, CellRangeAst, CellReferenceAst, ProcedureAst} from '../parser/Ast'
import {RangeMapping} from '../RangeMapping'
import {CriterionCache, EmptyCellVertex, Vertex} from '../Vertex'
import {buildCriterionLambda, Criterion, CriterionLambda, parseCriterion} from './Criterion'
import {Functions} from './Functions'

export class Interpreter {

  constructor(
    private readonly addressMapping: IAddressMapping,
    private readonly rangeMapping: RangeMapping,
    private readonly graph: Graph<Vertex>,
    private readonly config: Config,
  ) {

  }

  /**
   * Calculates cell value from formula abstract syntax tree
   *
   * @param formula - abstract syntax tree of formula
   * @param formulaAddress - address of the cell in which formula is located
   */
  public evaluateAst(ast: Ast, formulaAddress: SimpleCellAddress): CellValue {
    switch (ast.type) {
      case AstNodeType.CELL_REFERENCE: {
        const address = getAbsoluteAddress(ast.reference, formulaAddress)
        const vertex = this.addressMapping.getCell(address)!
        return vertex.getCellValue()
      }
      case AstNodeType.NUMBER:
      case AstNodeType.STRING: {
        return ast.value
      }
      case AstNodeType.CONCATENATE_OP: {
        return this.concatenate([ast.left, ast.right], formulaAddress)
      }
      case AstNodeType.EQUALS_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)

        if (isCellError(leftResult)) {
          return leftResult
        }
        if (isCellError(leftResult)) {
          return rightResult
        }

        if (typeof leftResult !== typeof rightResult) {
          return false
        } else {
          return leftResult === rightResult
        }
      }
      case AstNodeType.NOT_EQUAL_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)

        if (isCellError(leftResult)) {
          return leftResult
        }
        if (isCellError(leftResult)) {
          return rightResult
        }

        if (typeof leftResult !== typeof rightResult) {
          return true
        } else {
          return leftResult !== rightResult
        }
      }
      case AstNodeType.GREATER_THAN_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)

        if (typeof leftResult === typeof rightResult && typeof leftResult === 'number') {
          return leftResult > rightResult
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.LESS_THAN_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)

        if (typeof leftResult === typeof rightResult && typeof leftResult === 'number') {
          return leftResult < rightResult
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.GREATER_THAN_OR_EQUAL_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)

        if (typeof leftResult === typeof rightResult && typeof leftResult === 'number') {
          return leftResult >= rightResult
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.LESS_THAN_OR_EQUAL_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)

        if (typeof leftResult === typeof rightResult && typeof leftResult === 'number') {
          return leftResult <= rightResult
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.PLUS_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)
        if (typeof leftResult === 'number' && typeof rightResult === 'number') {
          return leftResult + rightResult
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.MINUS_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)
        if (typeof leftResult === 'number' && typeof rightResult === 'number') {
          return leftResult - rightResult
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.TIMES_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)
        if (typeof leftResult === 'number' && typeof rightResult === 'number') {
          return leftResult * rightResult
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.POWER_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)
        if (typeof leftResult === 'number' && typeof rightResult === 'number') {
          return Math.pow(leftResult, rightResult)
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.DIV_OP: {
        const leftResult = this.evaluateAst(ast.left, formulaAddress)
        const rightResult = this.evaluateAst(ast.right, formulaAddress)
        if (typeof leftResult === 'number' && typeof rightResult === 'number') {
          if (rightResult == 0) {
            return cellError(ErrorType.DIV_BY_ZERO)
          }
          return leftResult / rightResult
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.MINUS_UNARY_OP: {
        const value = this.evaluateAst(ast.value, formulaAddress)
        if (typeof value === 'number') {
          return -value
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case AstNodeType.FUNCTION_CALL: {
        return this.evaluateFunction(ast, formulaAddress)
      }
      case AstNodeType.CELL_RANGE: {
        return cellError(ErrorType.VALUE)
      }
      case AstNodeType.ERROR: {
        if (ast.args[0].type === 'StaticOffsetOutOfRangeError') {
          return cellError(ErrorType.REF)
        }
        return cellError(ErrorType.NAME)
      }
      default: {
        throw Error('Not supported Ast node type')
      }
    }
  }

  /**
   * Returns list of values for given range and function name
   *
   * If range is dependent on smaller range, list will contain value of smaller range for this function
   * and values of cells that are not present in smaller range
   *
   * @param functionName - function name (e.g. SUM)
   * @param ast - cell range ast
   * @param formulaAddress - address of the cell in which formula is located
   */
  private getRangeValues(functionName: string, ast: CellRangeAst, formulaAddress: SimpleCellAddress): CellValue[] {
    const [beginRange, endRange] = [getAbsoluteAddress(ast.start, formulaAddress), getAbsoluteAddress(ast.end, formulaAddress)]
    const rangeResult: CellValue[] = []
    const {smallerRangeVertex, restRangeStart, restRangeEnd} = findSmallerRange(this.rangeMapping, beginRange, endRange)
    const currentRangeVertex = this.rangeMapping.getRange(beginRange, endRange)!
    if (smallerRangeVertex && this.graph.existsEdge(smallerRangeVertex, currentRangeVertex)) {
      rangeResult.push(smallerRangeVertex.getFunctionValue(functionName)!)
    }

    for (const cellFromRange of generateCellsFromRangeGenerator(restRangeStart, restRangeEnd)) {
      rangeResult.push(this.addressMapping.getCell(cellFromRange)!.getCellValue())
    }

    return rangeResult
  }

  /**
   * Finds existing CriterionCache or returns fresh one and fetch list of remaining values.
   *
   * @param functionName - function name (e.g. SUMIF)
   * @param conditionLeftCorner - top-left corner of condition range
   * @param beginRange - top-left corner of computing range
   * @param endRange - bottom-right corner of computing range
   */
  private getCriterionRangeValues(functionName: string, conditionLeftCorner: SimpleCellAddress, beginRange: SimpleCellAddress, endRange: SimpleCellAddress): [CriterionCache, CellValue[]] {
    const currentRangeVertex = this.rangeMapping.getRange(beginRange, endRange)!
    const {smallerRangeVertex, restRangeStart, restRangeEnd} = findSmallerRange(this.rangeMapping, beginRange, endRange)

    let smallerRangeResult = null
    if (smallerRangeVertex && this.graph.existsEdge(smallerRangeVertex, currentRangeVertex)) {
      smallerRangeResult = smallerRangeVertex.getCriterionFunctionValues(functionName, conditionLeftCorner)
    }

    if (smallerRangeVertex !== null) {
      beginRange = restRangeStart
      endRange = restRangeEnd
    }

    const rangeResult = []
    for (const cellFromRange of generateCellsFromRangeGenerator(beginRange, endRange)) {
      rangeResult.push(this.addressMapping.getCell(cellFromRange)!.getCellValue())
    }

    return [smallerRangeResult || new Map(), rangeResult]
  }

  /**
   * Performs range operation on given range
   *
   * @param ast - cell range ast
   * @param formulaAddress - address of the cell in which formula is located
   * @param functionName - function name to use as cache key
   * @param funcToCalc - range operation
   */
  private evaluateRange(ast: CellRangeAst, formulaAddress: SimpleCellAddress, functionName: string, funcToCalc: RangeOperation): CellValue {
    const rangeStart = getAbsoluteAddress(ast.start, formulaAddress)
    const rangeEnd = getAbsoluteAddress(ast.end, formulaAddress)
    const rangeVertex = this.rangeMapping.getRange(rangeStart, rangeEnd)

    if (!rangeVertex) {
      throw Error('Range does not exists in graph')
    }

    let value = rangeVertex.getFunctionValue(functionName)
    if (!value) {
      const rangeValues = this.getRangeValues(functionName, ast, formulaAddress)
      value = funcToCalc(rangeValues)
      rangeVertex.setFunctionValue(functionName, value)
    }

    return value
  }

  private getPlainRangeValues(ast: CellRangeAst, formulaAddress: SimpleCellAddress) {
    return getPlainRangeValues(this.addressMapping, ast, formulaAddress)
  }

  /**
   * Calculates value of procedure formula based on procedure name
   *
   * @param ast - procedure abstract syntax tree
   * @param formulaAddress - address of the cell in which formula is located
   */
  private evaluateFunction(ast: ProcedureAst, formulaAddress: SimpleCellAddress): CellValue {
    switch (ast.procedureName) {
      case Functions[this.config.language].SUM: {
        return ast.args.reduce((currentSum: CellValue, arg) => {
          let value
          if (arg.type === AstNodeType.CELL_RANGE) {
            value = this.evaluateRange(arg, formulaAddress, 'SUM', rangeSum)
          } else {
            value = this.evaluateAst(arg, formulaAddress)
          }

          if (typeof currentSum === 'number' && typeof value === 'number') {
            return currentSum + value
          } else {
            return cellError(ErrorType.VALUE)
          }
        }, 0)
      }
      case Functions[this.config.language].SUMIF: {
        const criterionString = this.evaluateAst(ast.args[1], formulaAddress)
        if (typeof criterionString !== 'string') {
          return cellError(ErrorType.VALUE)
        }

        const criterion = parseCriterion(criterionString)
        if (criterion === null) {
          return cellError(ErrorType.VALUE)
        }

        const conditionRangeArg = ast.args[0]
        const valuesRangeArg = ast.args[2]

        if (conditionRangeArg.type === AstNodeType.CELL_RANGE && valuesRangeArg.type === AstNodeType.CELL_RANGE) {
          const conditionWidth = getRangeWidth(conditionRangeArg, formulaAddress)
          const conditionHeight = getRangeHeight(conditionRangeArg, formulaAddress)
          const valuesWidth = getRangeWidth(valuesRangeArg, formulaAddress)
          const valuesHeight = getRangeHeight(valuesRangeArg, formulaAddress)

          if (conditionWidth !== valuesWidth || conditionHeight !== valuesHeight) {
            return cellError(ErrorType.VALUE)
          }

          return this.evaluateRangeSumif(ast, formulaAddress, criterionString, criterion)
        } else if (conditionRangeArg.type === AstNodeType.CELL_REFERENCE && valuesRangeArg.type === AstNodeType.CELL_REFERENCE) {
          return this.evaluateCellSumif(ast, formulaAddress, criterion)
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case Functions[this.config.language].COUNTIF: {
        const conditionRangeArg = ast.args[0]
        if (conditionRangeArg.type !== AstNodeType.CELL_RANGE) {
          return cellError(ErrorType.VALUE)
        }

        const conditionValues = this.getPlainRangeValues(conditionRangeArg, formulaAddress)
        const criterionString = this.evaluateAst(ast.args[1], formulaAddress)
        if (typeof criterionString !== 'string') {
          return cellError(ErrorType.VALUE)
        }

        const criterion = parseCriterion(criterionString)
        if (criterion === null) {
          return cellError(ErrorType.VALUE)
        }

        const criterionLambda = buildCriterionLambda(criterion)
        let counter = 0
        for (const e of conditionValues) {
          if (criterionLambda(e)) {
            counter++
          }
        }
        return counter
      }
      case Functions[this.config.language].TRUE: {
        if (ast.args.length > 0) {
          return cellError(ErrorType.NA)
        } else {
          return true
        }
      }
      case Functions[this.config.language].FALSE: {
        if (ast.args.length > 0) {
          return cellError(ErrorType.NA)
        } else {
          return false
        }
      }
      case Functions[this.config.language].ACOS: {
        if (ast.args.length !== 1) {
          return cellError(ErrorType.NA)
        }

        const arg = this.evaluateAst(ast.args[0], formulaAddress)
        if (typeof arg !== 'number') {
          return cellError(ErrorType.VALUE)
        } else if (-1 <= arg && arg <= 1) {
          return Math.acos(arg)
        } else {
          return cellError(ErrorType.NUM)
        }
      }
      case Functions[this.config.language].IF: {
        const condition = this.booleanRepresentation(this.evaluateAst(ast.args[0], formulaAddress))
        if (condition === true) {
          return this.evaluateAst(ast.args[1], formulaAddress)
        } else if (condition === false) {
          if (ast.args[2]) {
            return this.evaluateAst(ast.args[2], formulaAddress)
          } else {
            return false
          }
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case Functions[this.config.language].AND: {
        if (ast.args.length < 1) {
          return cellError(ErrorType.NA)
        }

        let result: CellValue = true
        let index = 0
        while (result === true && index < ast.args.length) {
          const argValue = this.evaluateAst(ast.args[index], formulaAddress)
          result = this.booleanRepresentation(argValue)
          ++index
        }
        return result
      }
      case Functions[this.config.language].OR: {
        if (ast.args.length < 1) {
          return cellError(ErrorType.NA)
        }

        let result: CellValue = false
        let index = 0
        while (result === false && index < ast.args.length) {
          const argValue = this.evaluateAst(ast.args[index], formulaAddress)
          result = this.booleanRepresentation(argValue)
          ++index
        }
        return result
      }
      case Functions[this.config.language].CONCATENATE: {
        return this.concatenate(ast.args, formulaAddress)
      }
      case Functions[this.config.language].ISERROR: {
        if (ast.args.length != 1) {
          return cellError(ErrorType.NA)
        } else {
          const arg = this.evaluateAst(ast.args[0], formulaAddress)
          return isCellError(arg)
        }
      }
      case Functions[this.config.language].ISBLANK: {
        if (ast.args.length != 1) {
          return cellError(ErrorType.NA)
        }
        const arg = ast.args[0]
        if (arg.type === AstNodeType.CELL_REFERENCE) {
          const address = getAbsoluteAddress(arg.reference, formulaAddress)
          const vertex = this.addressMapping.getCell(address)
          return (vertex === EmptyCellVertex.getSingletonInstance())
        } else {
          return false
        }
      }
      case Functions[this.config.language].COLUMNS: {
        if (ast.args.length !== 1) {
          return cellError(ErrorType.NA)
        }
        const rangeAst = ast.args[0]
        if (rangeAst.type === AstNodeType.CELL_RANGE) {
          return (rangeAst.end.col - rangeAst.start.col + 1)
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case Functions[this.config.language].DATE: {
        if (ast.args.length !== 3) {
          return cellError(ErrorType.NA)
        }

        const year = this.evaluateAst(ast.args[0], formulaAddress)
        const month = this.evaluateAst(ast.args[1], formulaAddress)
        const day = this.evaluateAst(ast.args[2], formulaAddress)

        if (typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number') {
          return cellError(ErrorType.VALUE)
        }

        return toDateNumber(year, month, day)
      }
      case Functions[this.config.language].MONTH: {
        if (ast.args.length !== 1) {
          return cellError(ErrorType.NA)
        }

        const arg = this.evaluateAst(ast.args[0], formulaAddress)
        const dateNumber = this.dateNumberRepresentation(arg)

        if (dateNumber !== null) {
          return dateNumberToMonthNumber(dateNumber)
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case Functions[this.config.language].YEAR: {
        if (ast.args.length !== 1) {
          return cellError(ErrorType.NA)
        }

        const arg = this.evaluateAst(ast.args[0], formulaAddress)
        const dateNumber = this.dateNumberRepresentation(arg)

        if (dateNumber !== null) {
          return dateNumberToYearNumber(dateNumber)
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case Functions[this.config.language].TEXT: {
        if (ast.args.length !== 2) {
          return cellError(ErrorType.NA)
        }

        const dateArg = this.evaluateAst(ast.args[0], formulaAddress)
        const formatArg = this.evaluateAst(ast.args[1], formulaAddress)

        const dateNumber = this.dateNumberRepresentation(dateArg)

        if (dateNumber !== null && typeof formatArg === 'string') {
          return dateNumebrToStringFormat(dateNumber, formatArg)
        } else {
          return cellError(ErrorType.VALUE)
        }
      }
      case Functions[this.config.language].SPLIT: {
        const stringArg = ast.args[0]
        const indexArg = ast.args[1]

        const stringToSplit = this.evaluateAst(stringArg, formulaAddress)
        if (typeof stringToSplit !== 'string') {
          return cellError(ErrorType.VALUE)
        }
        const indexToUse = this.evaluateAst(indexArg, formulaAddress)
        if (typeof indexToUse !== 'number') {
          return cellError(ErrorType.VALUE)
        }

        const splittedString = stringToSplit.split(' ')

        if (indexToUse > splittedString.length || indexToUse < 0) {
          return cellError(ErrorType.VALUE)
        }

        return splittedString[indexToUse]
      }
      case Functions[this.config.language].MEDIAN: {
        if (ast.args.length === 0) {
          return cellError(ErrorType.NA)
        }

        const values: number[] = []
        for (const astArg of ast.args) {
          if (astArg.type === AstNodeType.CELL_RANGE) {
            const [beginRange, endRange] = [getAbsoluteAddress(astArg.start, formulaAddress), getAbsoluteAddress(astArg.end, formulaAddress)]
            for (const cellFromRange of generateCellsFromRangeGenerator(beginRange, endRange)) {
              const value = this.addressMapping.getCell(cellFromRange)!.getCellValue()
              if (typeof value === 'number') {
                values.push(value)
              } else if (isCellError(value)) {
                return value
              } else {
                return cellError(ErrorType.NA)
              }
            }
          } else {
            const value = this.evaluateAst(astArg, formulaAddress)
            if (typeof value === 'number') {
              values.push(value)
            } else if (isCellError(value)) {
              return value
            } else {
              return cellError(ErrorType.NA)
            }
          }
        }

        values.sort((a, b) => (a - b))

        if (values.length % 2 === 0) {
          return (values[(values.length / 2) - 1] + values[values.length / 2]) / 2
        } else {
          return values[Math.floor(values.length / 2)]
        }
      }
      default:
        return cellError(ErrorType.NAME)
    }
  }

  /**
   * Concatenate values of arguments.
   *
   * @param args
   * @param formulaAddress
   */
  private concatenate(args: Ast[], formulaAddress: SimpleCellAddress): CellValue {
    return args.reduce((acc: CellValue, arg: Ast) => {
      const argResult = this.evaluateAst(arg, formulaAddress)
      if (isCellError(acc)) {
        return acc
      } else if (isCellError(argResult)) {
        return argResult
      } else {
        return (acc as string).concat(argResult.toString())
      }
    }, '')
  }

  /**
   * Converts cell value to date number representation (days after 12th Dec 1899)
   *
   * If value is a number simply returns value
   * If value is a string, it tries to parse it with known format
   *
   * @param arg
   */
  private dateNumberRepresentation(arg: CellValue): number | null {
    if (typeof arg === 'number') {
      return arg
    } else if (typeof arg === 'string') {
      return stringToDateNumber(arg, this.config.dateFormat)
    } else {
      return null
    }
  }

  /**
   * Converts cell value to boolean representation
   *
   * if value is a boolean simply returns value
   * if value is a number return true if value is different than 0
   *
   * @param arg
   */
  private booleanRepresentation(arg: CellValue): CellValue {
    if (typeof arg === 'number') {
      return arg !== 0
    } else if (typeof arg === 'boolean') {
      return arg
    } else {
      return cellError(ErrorType.VALUE)
    }
  }

  /**
   * Computes SUMIF function for range arguments.
   *
   * @param ast - ast of the SUMIF function call
   * @param formulaAddress - address of the cell with function call
   * @param criterionString - raw value of the criterion passed to function call
   * @param criterion - computed value of the criterion passed to function call
   */
  private evaluateRangeSumif(ast: ProcedureAst, formulaAddress: SimpleCellAddress, criterionString: string, criterion: Criterion): CellValue {
    const functionName = 'SUMIF'
    const conditionRangeArg = ast.args[0] as CellRangeAst
    const valuesRangeArg = ast.args[2] as CellRangeAst

    const conditionRangeStart = getAbsoluteAddress(conditionRangeArg.start, formulaAddress)
    const valuesRangeStart = getAbsoluteAddress(valuesRangeArg.start, formulaAddress)
    const valuesRangeEnd = getAbsoluteAddress(valuesRangeArg.end, formulaAddress)

    const valuesRangeVertex = this.rangeMapping.getRange(valuesRangeStart, valuesRangeEnd)
    if (!valuesRangeVertex) {
      throw Error('Range does not exists in graph')
    }

    let rangeValue = valuesRangeVertex.getCriterionFunctionValue(functionName, conditionRangeStart, criterionString)
    if (rangeValue) {
      return rangeValue
    } else {
      const [smallerCache, values] = this.getCriterionRangeValues(functionName, conditionRangeStart, valuesRangeStart, valuesRangeEnd)

      const conditions = this.getPlainRangeValues(conditionRangeArg, formulaAddress)
      const restConditions = conditions.slice(conditions.length - values.length)

      /* copy old cache and actualize values */
      const cache: CriterionCache = new Map()
      smallerCache.forEach(([value, criterionLambda]: [CellValue, CriterionLambda], key: string) => {
        const filteredValues = ifFilter(criterionLambda, restConditions[Symbol.iterator](), values[Symbol.iterator]())
        let reducedSum = reduceSum(filteredValues)
        reducedSum = add(reducedSum, value)
        cache.set(key, [reducedSum, criterionLambda])

        if (key === criterionString) {
          rangeValue = reducedSum
        }
      })

      /* if there was no previous value for this criterion, we need to calculate it from scratch */
      if (!rangeValue) {
        const criterionLambda = buildCriterionLambda(criterion)
        const values = this.getPlainRangeValues(valuesRangeArg, formulaAddress)

        const filteredValues = ifFilter(criterionLambda, conditions[Symbol.iterator](), values[Symbol.iterator]())
        const reducedSum = reduceSum(filteredValues)
        cache.set(criterionString, [reducedSum, criterionLambda])

        rangeValue = reducedSum
      }

      valuesRangeVertex.setCriterionFunctionValues(functionName, conditionRangeStart, cache)
      return rangeValue
    }
  }

  /**
   * Computes SUMIF function for single-cell arguments
   *
   * @param ast - ast of the SUMIF function call
   * @param formulaAddress - address of the cell with function call
   * @param criterion - computed value of the criterion passed to function call
   */
  private evaluateCellSumif(ast: ProcedureAst, formulaAddress: SimpleCellAddress, criterion: Criterion): CellValue {
    const conditionReferenceArg = ast.args[0] as CellReferenceAst
    const valuesReferenceArg = ast.args[2] as CellReferenceAst

    const conditionValues = [this.evaluateAst(conditionReferenceArg, formulaAddress)][Symbol.iterator]()
    const computableValues = [this.evaluateAst(valuesReferenceArg, formulaAddress)][Symbol.iterator]()
    const criterionLambda = buildCriterionLambda(criterion)
    const filteredValues = ifFilter(criterionLambda, conditionValues, computableValues)
    return reduceSum(filteredValues)
  }
}

export type RangeOperation = (rangeValues: CellValue[]) => CellValue

export function rangeSum(rangeValues: CellValue[]): CellValue {
  return rangeValues.reduce((acc: CellValue, val: CellValue) => {
    if (isCellError(acc)) {
      return acc
    }
    if (isCellError(val)) {
      return val
    }

    if (typeof acc === 'number' && typeof val === 'number') {
      return acc + val
    } else {
      return acc
    }
  })
}

export function getPlainRangeValues(addressMapping: IAddressMapping, ast: CellRangeAst, formulaAddress: SimpleCellAddress): CellValue[] {
  const [beginRange, endRange] = [getAbsoluteAddress(ast.start, formulaAddress), getAbsoluteAddress(ast.end, formulaAddress)]
  const result: CellValue[] = []
  for (const cellFromRange of generateCellsFromRangeGenerator(beginRange, endRange)) {
    result.push(addressMapping.getCell(cellFromRange)!.getCellValue())
  }
  return result
}

export function* ifFilter(criterionLambda: CriterionLambda, conditionalIterable: IterableIterator<CellValue>, computableIterable: IterableIterator<CellValue>): IterableIterator<CellValue> {
  const conditionalSplit = split(conditionalIterable)
  const computableSplit = split(computableIterable)
  if (conditionalSplit.hasOwnProperty('value') && computableSplit.hasOwnProperty('value')) {
    const conditionalFirst = conditionalSplit.value as CellValue
    const computableFirst = computableSplit.value as CellValue
    if (criterionLambda(conditionalFirst)) {
      yield computableFirst
    }

    yield* ifFilter(criterionLambda, conditionalSplit.rest, computableSplit.rest)
  }
}

export function add(left: CellValue, right: CellValue): CellValue {
  if (isCellError(left)) {
    return left
  }
  if (isCellError(right)) {
    return right
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left + right
  }

  return left
}

export function reduceSum(iterable: IterableIterator<CellValue>): CellValue {
  let acc: CellValue = 0
  for (const val of iterable) {
    acc = add(acc, val)
  }
  return acc
}

const getRangeWidth = (ast: CellRangeAst, baseAddress: SimpleCellAddress) => {
  const absoluteStart = getAbsoluteAddress(ast.start, baseAddress)
  const absoluteEnd = getAbsoluteAddress(ast.end, baseAddress)
  return absoluteEnd.col - absoluteStart.col
}

const getRangeHeight = (ast: CellRangeAst, baseAddress: SimpleCellAddress) => {
  const absoluteStart = getAbsoluteAddress(ast.start, baseAddress)
  const absoluteEnd = getAbsoluteAddress(ast.end, baseAddress)
  return absoluteEnd.row - absoluteStart.row
}
