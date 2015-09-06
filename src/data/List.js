// TODO entry.getLon(), entry.getLat()
// List supported for cartesian, polar coordinateSystem
define(function(require) {
    'use strict';

    var zrUtil = require('zrender/core/util');
    var Model = require('../model/Model');
    var DataDiffer = require('./DataDiffer');

    function createArrayIterWithDepth(maxDepth, properties, cb, context, iterType) {
        // Simple optimization to avoid read the undefined value in properties array
        var nestedProperties = properties.length > 0;
        return function eachAxis(array, depth) {
            if (depth === maxDepth) {
                return zrUtil[iterType](array, cb, context);
            }
            else if (array) {
                var property = properties[depth];
                for (var i = 0; i < array.length; i++) {
                    var item = array[i];
                    // Access property of each item
                    if (nestedProperties && property && item) {
                        item = item[property];
                    }
                    array[i] = eachAxis(item, depth);
                }
            }
        }
    }
    var dimensions = ['x', 'y', 'z', 'value', 'radius', 'angle']
    /**
     * @name echarts/data/List~Entry
     * @extends {module:echarts/model/Model}
     *
     * @param {Object} option
     * @param {module:echarts/model/Model} parentModel
     * @param {number} dataIndex
     * @param {Array.<string>} [independentVar=['x']]
     * @param {Array.<string>} [dependentVar='y']
     */
    var Entry = Model.extend({

        layout: null,

        /**
         * @type {number}
         * @protected
         */
        xIndex: 0,

        /**
         * @type {number}
         * @protected
         */
        yIndex: 1,

        /**
         * @type {number}
         * @protected
         */
        zIndex: -1,

        /**
         * @type {number}
         * @protected
         */
        radiusIndex: 0,

        /**
         * @type {number}
         * @protected
         */
        angleIndex: 1,

        /**
         * @type {number}
         * @protected
         */
        valueIndex: 1,

        init: function (option, parentModel, dataIndex, independentVar, dependentVar) {

            /**
             * @type {string}
             * @memeberOf module:echarts/data/List~Entry
             * @public
             */
            this.name = option.name || '';

            this.option = option;

            var value = option.value == null ? option : option.value;

            if (typeof value === 'number') {
                value = [dataIndex, value];
            }

            if (independentVar) {
                for (var i = 0; i < independentVar.length; i++) {
                    this[independentVar[i] + 'Index'] = i;
                }
                this.valueIndex = value.length - 1;

                this[dependentVar + 'Index'] = this.valueIndex;
            }

            /**
             * @type {Array.<number>}
             * @memeberOf module:echarts/data/List~Entry
             * @private
             */
            this._value = value;

            /**
             * @private
             * @readOnly
             */
            this.dataIndex = dataIndex;
        },

        /**
         * @return {number}
         */
        getStackedValue: function () {
            if (this.dimension !== 1) {
                // Only 1d value support stack
                return this.getValue();
            }
        },

        clone: function () {
            var entry = new Entry(
                this.option, this.parentModel, this.dataIndex
            );
            entry.name = this.name;

            for (var i = 0; i < dimensions.length; i++) {
                var key = dimensions[i] + 'Index';
                entry[key] = this[key];
            }
            return entry;
        }
    });

    zrUtil.each(dimensions, function (dim) {
        var capitalized = dim[0].toUpperCase() + dim.substr(1);
        var indexKey = dim + 'Index';
        Entry.prototype['get' + capitalized] = function () {
            var index = this[indexKey];
            if (index >= 0) {
                return this._value[index];
            }
        }
        Entry.prototype['set' + capitalized] = function (val) {
            var index = this[indexKey];
            if (index >= 0) {
                this._value[indexKey] = val;
            }
        }
    });

    function List() {
        this.elements = [];
    }

    List.prototype = {

        constructor: List,

        type: 'list',

        each: function (cb, context) {
            context = context || this;
            zrUtil.each(this.elements, cb, context);
        },

        /**
         * Data mapping, returned array is flatten
         * PENDING
         */
        map: function (cb, context) {
            var ret = [];
            this.each(function (item, idx) {
                ret.push(cb && cb.call(context || this, item));
            }, context);
            return ret;
        },

        filter: function (cb, context) {
            var list = new List();
            context = context || this;
            list.elements = zrUtil.filter(this.elements, cb, context);
        },

        /**
         * @return {module:echarts/data/List~Entry}
         */
        getByName: function (name) {
            // TODO deep hierarchy
            var elements = this.elements;
            for (var i = 0; i < elements.length; i++) {
                if (elements[i].name === name) {
                    return elements[i];
                }
            }
        },

        /**
         * @param {string} name
         * @param {*} option
         */
        append: function (name, option) {
            var elements = this.elements;
            var el = new Entry(option, null, elements.length);
            el.name = name;
            elements.push(el);
            return el;
        },

        diff: function (oldList) {
            return new DataDiffer(oldList ? oldList.elements : [], this.elements);
        },

        clone: function () {
            var list = new List();
            var elements = this.elements;
            for (var i = 0; i < elements.length; i++) {
                list.elements.push(elements[i].clone());
            }
            list.depth = this.depth;
            list.properties = this.properties;
            return list;
        }
    };

    zrUtil.each(['X', 'Y', 'Z', 'Value'], function (name) {
        List.prototype['each' + name] = function (cb, context) {
            this.each(function (item, idx) {
                cb && cb.call(context || this, item['get' + name](idx));
            }, context);
        };

        List.prototype['map' + name] = function (cb, context) {
            var ret = [];
            this.each(function (item) {
                ret.push(cb && cb.call(context || this, item['get' + name]()));
            }, context);
            return ret;
        };

        List.prototype['filter' + name] = function (cb, context) {
            var newList = this.clone();
            var elements = []
            newList.each(function (item) {
                if (cb.call(context || newList, item['get' + name]())) {
                    elements.push(item);
                }
            }, context);
            newList.elements = elements;
            return newList;
        };
    });

    List.fromArray = function (data, seriesModel, ecModel) {
        var coordinateSystem = seriesModel.get('coordinateSystem');
        var independentVar;
        var dependentVar;

        // FIXME
        // 这里 List 跟几个坐标系和坐标系 Model 耦合了
        if (coordinateSystem === 'cartesian2d') {
            var xAxisModel = ecModel.getComponent('xAxis', seriesModel.get('xAxisIndex'));
            var yAxisModel = ecModel.getComponent('yAxis', seriesModel.get('yAxisIndex'));
            if (xAxisModel.get('type') === 'category') {
                independentVar = ['x'];
                dependentVar = 'y';
            }
            else if (yAxisModel.get('type') === 'category') {
                independentVar = ['y'];
                dependentVar = 'x';
            }
            else {
                // PENDING
                var dim = data[0] && data[0].length;
                if (dim === 2) {
                    independentVar = ['x'];
                    dependentVar = 'y';
                }
                else if (dim === 3) {
                    independentVar = ['x', 'y'];
                    dependentVar = 'z';
                }
            }
        }
        else if (coordinateSystem === 'polar') {
            var axisFinder = function (axisModel) {
                return axisModel.get('polarIndex') === polarIndex;
            };
            var polarIndex = seriesModel.get('polarIndex') || 0;
            var angleAxisModel = ecModel.findComponent('angleAxis', axisFinder);
            var radiusAxisModel = ecModel.findComponent('radiusAxis', axisFinder);

            if (angleAxisModel.get('type') === 'category') {
                independentVar = ['angle'];
                dependentVar = 'radius';
            }
            else if (radiusAxisModel.get('type') === 'category') {
                independentVar = ['radius'];
                dependentVar = 'angle';
            }
            else {
                var dim = data[0] && data[0].length;
                if (dim === 2) {
                    independentVar = ['radius'];
                    dependentVar = 'angle';
                }
                else if (dim === 3) {
                    independentVar = ['radius', 'angle'];
                    dependentVar = 'value';
                }
            }
        }

        var list = new List();

        // Normalize data
        list.elements = zrUtil.map(data, function (dataItem, index) {
            var entry = new Entry(dataItem, seriesModel, index, independentVar, dependentVar);
            // FIXME
            if (! dataItem.name) {
                entry.name = index;
            }
            return entry;
        });
        return list;
    };

    List.Entry = Entry;

    return List;
});