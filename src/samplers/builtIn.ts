import clamp from 'clamp'

import utils from '../utils'
import { builtIn as evaluate } from '../helpers/eval'

import { FunctionPlotDatum, FunctionPlotScale } from '../types'
import { SamplerParams, SamplerFn } from './types'

function checkAsymptote(
  d0: number[],
  d1: number[],
  d: FunctionPlotDatum,
  sign: number,
  level: number
): {
  asymptote: boolean
  d0: number[]
  d1: number[]
} {
  if (!level) {
    return { asymptote: true, d0, d1 }
  }
  const n = 10
  const x0 = d0[0]
  const x1 = d1[0]
  const samples = utils.linspace(x0, x1, n)
  let oldY, oldX
  for (let i = 0; i < n; i += 1) {
    const x = samples[i]
    const y = evaluate(d, 'fn', { x })

    if (i && oldY) {
      const deltaY = y - oldY
      const newSign = utils.sgn(deltaY)
      if (newSign === sign) {
        return checkAsymptote([oldX, oldY], [x, y], d, sign, level - 1)
      }
    }
    oldY = y
    oldX = x
  }
  return { asymptote: false, d0, d1 }
}

/**
 * Splits the evaluated data into arrays, each array is separated by any asymptote found
 * through the process of detecting slope/sign brusque changes
 *
 * @returns {Array[]}
 */
function split(d: FunctionPlotDatum, data: number[][], yScale: FunctionPlotScale): Array<any> {
  let i, oldSign
  let deltaX
  let st = []
  const sets = []
  const domain = yScale.domain()
  const yMin = domain[0]
  const yMax = domain[1]

  if (data[0]) {
    st.push(data[0])
    deltaX = data[1][0] - data[0][0]
    oldSign = utils.sgn(data[1][1] - data[0][1])
  }

  function updateY(d: number[]) {
    d[1] = Math.min(d[1], yMax)
    d[1] = Math.max(d[1], yMin)
    return d
  }

  i = 1
  while (i < data.length) {
    const y0 = data[i - 1][1]
    const y1 = data[i][1]
    const deltaY = y1 - y0
    const newSign = utils.sgn(deltaY)
    // make a new set if:
    if (
      // utils.sgn(y1) * utils.sgn(y0) < 0 && // there's a change in the evaluated values sign
      // there's a change in the slope sign
      oldSign !== newSign &&
      // the slope is bigger to some value (according to the current zoom scale)
      Math.abs(deltaY / deltaX) > 1 / 1
    ) {
      // retest this section again and determine if it's an asymptote
      const check = checkAsymptote(data[i - 1], data[i], d, newSign, 3)
      if (check.asymptote) {
        st.push(updateY(check.d0))
        sets.push(st)
        st = [updateY(check.d1)]
      }
    }
    oldSign = newSign
    st.push(data[i])
    ++i
  }

  if (st.length) {
    sets.push(st)
  }

  return sets
}

function linear(samplerParams: SamplerParams): Array<any> {
  const allX = utils.space(samplerParams.xAxis, samplerParams.range, samplerParams.nSamples)
  const yDomain = samplerParams.yScale.domain()
  const yDomainMargin = yDomain[1] - yDomain[0]
  const yMin = yDomain[0] - yDomainMargin * 1e5
  const yMax = yDomain[1] + yDomainMargin * 1e5
  let data = []
  for (let i = 0; i < allX.length; i += 1) {
    const x = allX[i]
    const y = evaluate(samplerParams.d, 'fn', { x })
    if (utils.isValidNumber(x) && utils.isValidNumber(y)) {
      data.push([x, clamp(y, yMin, yMax)])
    }
  }
  data = split(samplerParams.d, data, samplerParams.yScale)
  return data
}

function parametric(samplerParams: SamplerParams): Array<any> {
  // range is mapped to canvas coordinates from the input
  // for parametric plots the range will tell the start/end points of the `t` param
  const parametricRange = samplerParams.d.range || [0, 2 * Math.PI]
  const tCoords = utils.space(samplerParams.xAxis, parametricRange, samplerParams.nSamples)
  const samples = []
  for (let i = 0; i < tCoords.length; i += 1) {
    const t = tCoords[i]
    const x = evaluate(samplerParams.d, 'x', { t })
    const y = evaluate(samplerParams.d, 'y', { t })
    samples.push([x, y])
  }
  return [samples]
}

function polar(samplerParams: SamplerParams): Array<any> {
  // range is mapped to canvas coordinates from the input
  // for polar plots the range will tell the start/end points of the `theta` param
  const polarRange = samplerParams.d.range || [-Math.PI, Math.PI]
  const thetaSamples = utils.space(samplerParams.xAxis, polarRange, samplerParams.nSamples)
  const samples = []
  for (let i = 0; i < thetaSamples.length; i += 1) {
    const theta = thetaSamples[i]
    const r = evaluate(samplerParams.d, 'r', { theta })
    const x = r * Math.cos(theta)
    const y = r * Math.sin(theta)
    samples.push([x, y])
  }
  return [samples]
}

function points(samplerParams: SamplerParams): Array<any> {
  return [samplerParams.d.points]
}

function vector(sampleParams: SamplerParams): Array<any> {
  const d = sampleParams.d
  d.offset = d.offset || [0, 0]
  return [[d.offset, [d.vector[0] + d.offset[0], d.vector[1] + d.offset[1]]]]
}

const sampler: SamplerFn = function sampler(samplerParams: SamplerParams): Array<any> {
  const fnTypes = {
    parametric,
    polar,
    points,
    vector,
    linear
  }
  if (!(samplerParams.d.fnType in fnTypes)) {
    throw Error(samplerParams.d.fnType + ' is not supported in the `builtIn` sampler')
  }
  // @ts-ignore
  return fnTypes[samplerParams.d.fnType].apply(null, arguments)
}

export default sampler
