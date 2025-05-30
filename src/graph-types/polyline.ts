import { select as d3Select, Selection } from 'd3-selection'
import { line as d3Line, area as d3Area, curveLinear as d3CurveLinear } from 'd3-shape'

import { color, infinity, clamp } from '../utils.mjs'
import { builtInEvaluate } from '../evaluate-datum.js'

import { Chart } from '../index.js'
import { FunctionPlotDatum } from '../types.js'

export default function polyline(chart: Chart) {
  function plotLine(selection: Selection<any, FunctionPlotDatum, any, any>) {
    selection.each(function (d) {
      const el = ((plotLine as any).el = d3Select(this))
      const index = d.index
      const evaluatedData = builtInEvaluate(chart, d)
      const computedColor = color(d, index)

      const yRange = chart.meta.yScale.range()
      let yMax = yRange[0]
      let yMin = yRange[1]

      // Fix #342
      // When yAxis is reversed, the yRange is inverted, i.e. yMin > yMax
      if (yMin > yMax) [yMin, yMax] = [yMax, yMin]

      // workaround, clamp assuming that the bounds are finite but huge
      const diff = yMax - yMin
      yMax += diff * 1e6
      yMin -= diff * 1e6
      if (d.skipBoundsCheck) {
        yMax = infinity()
        yMin = -infinity()
      }

      function y(d: number[]) {
        return clamp(chart.meta.yScale(d[1]), yMin, yMax)
      }

      const line = d3Line()
        .curve(d3CurveLinear)
        .x(function (d) {
          return chart.meta.xScale(d[0])
        })
        .y(y)
      const area = d3Area()
        .x(function (d) {
          return chart.meta.xScale(d[0])
        })
        .y0(chart.meta.yScale(0))
        .y1(y)

      const vectorMarkerId = `${d.id}-vector-marker`
      if (d.fnType === 'vector') {
        // vector
        const vectorInnerSelection = el.selectAll(':scope > defs').data(evaluatedData)
        // enter
        vectorInnerSelection
          .enter()
          .append('defs')
          .append('clipPath')
          .append('marker')
          .attr('id', vectorMarkerId)
          .attr('viewBox', '0 -5 10 10')
          .attr('refX', 10)
          .attr('markerWidth', 5)
          .attr('markerHeight', 5)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M0,-5L10,0L0,5L0,0')
          .attr('stroke-width', '0px')
          .attr('fill-opacity', 1)

        // enter + update
        vectorInnerSelection.merge(vectorInnerSelection.enter().selectAll('defs')).each(function () {
          d3Select(this).selectAll('path').attr('fill', computedColor)
        })

        // exit
        vectorInnerSelection.exit().remove()
      }

      // join
      const innerSelection = el.selectAll(':scope > path.line').data(evaluatedData)

      const cls = `line line-${index}`
      const innerSelectionEnter = innerSelection
        .enter()
        .append('path')
        .attr('class', cls)
        .attr('stroke-width', 1)
        .attr('stroke-linecap', 'round')

      // enter + update
      innerSelection.merge(innerSelectionEnter).each(function () {
        const path = d3Select(this)
        let pathD
        if (d.closed) {
          path.attr('fill', computedColor)
          path.attr('fill-opacity', 0.3)
          pathD = area
        } else {
          path.attr('fill', 'none')
          pathD = line
        }
        path
          .attr('stroke', computedColor)
          .attr('marker-end', function () {
            // special marker for vectors
            return d.fnType === 'vector' ? `url(#${vectorMarkerId})` : null
          })
          .attr('d', pathD)

        if (d.attr) {
          for (const k in d.attr) {
            // If the attribute to modify is class then append the default class
            // or otherwise the d3 selection won't work.
            let val = d.attr[k]
            if (k === 'class') {
              val = `${cls} ${d.attr[k]}`
            }
            path.attr(k, val)
          }
        }
      })

      // exit
      innerSelection.exit().remove()
    })
  }

  return plotLine
}
