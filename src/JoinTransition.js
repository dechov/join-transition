import { Component } from 'react'
import PropTypes from 'prop-types'
import { transition } from 'd3-transition'
import { interpolate } from 'd3-interpolate'

import datajoin from './datajoin'


const extent = (collection, accessor) => {
  let min = Infinity, max = -Infinity
  for (let i = 0; i < collection.length; i++) {
    const value = accessor ? accessor(collection[i]) : collection[i]
    if (value < min) min = value
    if (value > max) max = value
  }
  return [min, max]
}

const zip = (a, b) => a.map((d, i) => [d, b[i]])

let nextId = 0


export default class JoinTransition extends Component {

  static propTypes = {
    values: PropTypes.any.isRequired,
    children: PropTypes.func.isRequired,

    interpolate: PropTypes.func,
    shouldTransition: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    queue: PropTypes.bool,
    duration: PropTypes.number,
    ease: PropTypes.func,
    onTransitionEnd: PropTypes.func,

    identify: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    enter: PropTypes.oneOfType([PropTypes.any, PropTypes.func]),
    exit: PropTypes.oneOfType([PropTypes.any, PropTypes.func]),
    enterOrExit: PropTypes.oneOfType([PropTypes.any, PropTypes.func]),
    stagger: PropTypes.oneOfType([PropTypes.number, PropTypes.func]),
    orderBy: PropTypes.func,
  }

  static defaultProps = {
    interpolate,
    shouldTransition: (a, b) => a !== b,
    queue: false,
    duration: null,
    ease: null,

    identify: 'id',
    enter: null,
    exit: null,
    stagger: 0,
    orderBy: null,
  }

  render() {
    return this.props.children(this.state.values, this.state.prevValues)
  }

  setValues(values) {
    this.setState({ values, prevValues: values })
  }

  componentWillMount() {
    this.setValues(this.props.values)
    this.id = nextId++
  }

  componentWillUnmount() {
    if (this.transition != null) {
      this.transition.selection().interrupt(`JoinTransition-${this.id}`)
    }
  }

  componentWillReceiveProps(props) {
    if (typeof props.shouldTransition === 'function' ? !props.shouldTransition(this.props.values, props.values) : !props.shouldTransition) {
      return this.setValues(props.values)
    }

    const plural = Array.isArray(props.values)

    this.transition =
      !props.queue || !this.transition
        ? transition(`JoinTransition-${this.id}`)
        : this.transition.transition()

    const defaultEase = this.transition.ease()
    if (props.duration != null) this.transition.duration(props.duration)
    if (plural) this.transition.ease(t => +t)
    else if (props.ease != null) this.transition.ease(props.ease)

    const enterValue = props.enter || props.enterOrExit
    const exitValue = props.exit || props.enterOrExit
    const enterFrom = typeof enterValue === 'function' ? enterValue : d => ({ ...d, ...enterValue })
    const exitTo = typeof exitValue === 'function' ? exitValue : d => ({ ...d, ...exitValue })

    let interpolator
    
    if (plural) {
      const { before, after } = datajoin(this.state.values, props.values, {
        key: props.identify, enterFrom, exitTo
      })
      const interpolators = zip(before, after).map(([from, to]) => props.interpolate(from, to, interpolate))

      const staggerAmount = typeof props.stagger === 'function' ? props.stagger(before, after) : props.stagger,
            staggerCoefficient = 1 / (1 - staggerAmount),
            staggerRange = props.orderBy ? extent(after, props.orderBy) : [0, after.length - 1],
            staggerRangeSize = staggerRange[1] - staggerRange[0],
            staggerScale = staggerRangeSize === 0 ? () => 0 : value => (value - staggerRange[0]) / staggerRangeSize
        
      interpolator = t =>
        after.map((d, i) => {
          const staggerValue = props.orderBy != null ? props.orderBy(d, i) : i
          const t_i = staggerCoefficient * t + (1 - staggerCoefficient) * staggerScale(staggerValue)
          const ease = props.ease != null ? props.ease : defaultEase
          return { ...d, ...interpolators[i](ease(Math.min(1, Math.max(0, t_i)))) }
        })
    }
    else if (this.state.values != null || props.values != null) {
      interpolator = props.interpolate(
        this.state.values == null ? enterFrom(props.values) : this.state.values,
        props.values == null ? exitTo(this.state.values) : props.values,
        interpolate
      )
    }
    else return this.setValues(props.values)

    this.setState({ values: interpolator(0), prevValues: interpolator(0) })
    this.transition
      .tween('values', () => t => {
        this.setState({ values: interpolator(t), prevValues: this.state.values })
      })
      .on('end', () => {
        this.setValues(props.values)
        this.transition = null
        props.onTransitionEnd && props.onTransitionEnd()
      })
  }

}
