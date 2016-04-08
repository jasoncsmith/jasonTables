// !! NOTE: not just me... 
// https://github.com/knockout/knockout/issues/237
// https://github.com/knockout/knockout/issues/248
JASON = JASON || {};
JASON.apis = JASON.apis || {};

JASON.utils = {
    checkVariableType: function(val) {
        //toType({a: 4}); //"object"
        //toType([1, 2, 3]); //"array"
        //(function() {console.log(toType(arguments))})(); //arguments
        //toType(new ReferenceError); //"error"
        //toType(new Date); //"date"
        //toType(/a-z/); //"regexp"
        //toType(Math); //"math"
        //toType(JSON); //"json"
        //toType(new Number(4)); //"number"
        //toType(new String("abc")); //"string"
        //toType(new Boolean(true)); //"boolean"
        return ({}).toString.call(val).match(/\s([a-z|A-Z]+)/)[1].toLowerCase();
    },
    numbers: {
        addThousandsSeperators: function(integerPart, seperator) {
            if (integerPart === null || integerPart === void 0) return null;

            var isNegative = +integerPart < 0;
            var val = isNegative ? String(integerPart).replace('-', '') : integerPart;

            var temporary = val.split('').reverse();
            var formattedIntegerPart = [];

            for (var i = 0, len = temporary.length; i < len; i++) {
                if (i === 0) {
                    formattedIntegerPart.unshift(temporary[i]);
                    continue;
                }

                if (i % 3 === 0) formattedIntegerPart.unshift(seperator);

                formattedIntegerPart.unshift(temporary[i]);
            }

            if (isNegative) formattedIntegerPart.unshift('-');

            return formattedIntegerPart.join('');
        },
    },
    dates: {
		convertStringToDateObject: function (str) {
			// expects '02/07/2014'
            if (JASON.utils.checkVariableType(str) !== 'string') return str;
            
			var tempArray = str.split('/');
			var date = {
				month: (+tempArray[0]) - 1, // [0-11]
				day: +tempArray[1],
				year: +tempArray[2]
			}
			return (new Date(date.year, date.month, date.day));
		},
		convertDateObjectToString: function (obj) {
            if (JASON.utils.checkVariableType(obj) !== 'object') return obj;
            
			var month = obj.getMonth() + 1;
			var day = obj.getDate();

			var formattedMonth = (+month > 0 && +month < 10) ? '0' + month : month;
			var formattedDay = (+day > 0 && +day < 10) ? '0' + day : day;

			return [formattedMonth, formattedDay, obj.getFullYear()].join('/');
		}        
    }
};

ko.bindingHandlers.formatUnits = {
    init: function(element, valueAccessor, allBindingsAccessor) {
        //var value = valueAccessor();
        //var isNumber = JASON.utils.numbers.isNumber(value);
        // force an autonumeric for write enabled inputs?
    },
    update: function(element, valueAccessor, allBindingsAccessor) {
        var value = ko.unwrap(valueAccessor());
        var options = allBindingsAccessor().formatUnitsOptions || {};

        var truncateTo = typeof options.fractionalPart === 'number' ? options.fractionalPart : 2;
        var roundValue = options.rounding || false;

        if (truncateTo === void 0 || truncateTo === null) {
            JASON.core.errorHandler('fractionalPart must be defined.');
            return;
        }

        function addZeroesToMatchDesiredPrecision(value, quantity) {
            var output = [value];
            var index = 0;
            while (index < quantity) {
                output.push('0');
                index++;
            }
            return output.join('');
        };


        if (roundValue) {
            value = parseFloat(value).toFixed(truncateTo);
        }

        var sValue = ('' + value);
        var parts = sValue.split('.');

        var integerPart = parts[0] || '0';
        var fractionalPart = addZeroesToMatchDesiredPrecision(parts[1] || '0', truncateTo);

        var formattedIntegerPart = JASON.utils.numbers.addThousandsSeperators(integerPart, ',');

        var output = [formattedIntegerPart, fractionalPart.substring(0, truncateTo)].join(truncateTo === 0 ? '' : '.');

        $(element).html(output);
    }
};


// only uses loader on the initial GET.
JASON.apis.JasonTables = function(options, records) {
    // !! this API by default excludes (viewing, filtering) records with IS_DISABLED set to true
    // IS_DISABLED records are only viewable through the Advanced Search API.
    // this API needs to be notified anytime that a records is set to IS_DISABLED
    // so that the record list is updated

    var Column = function(data) {
        this.title = data.title;
        this.key = data.key;
        this.canSort = data.canSort;
        this.canSearch = data.canSearch;
        this.sortFn = data.sortFn;
        this.state = ko.observable(data.state);
        this.className = data.className;
        this.isLoading = ko.observable(false);
        this.sortDirection = ko.computed(this.getSortDirection, this);
        this.sortIcon = ko.computed(this.getSortIcon, this);
    };
    Column.prototype.getSortDirection = function() {
        var state = this.state();

        switch (state) {
            case 'idle': return 'sort_idle';
            case 'Ascending': return 'sort_asc';
            case 'Descending': return 'sort_dsc';
            case 'disabled': return 'sort_disabled';
            case 'invisible': return 'sort_invisible'; // for conor's hack.
            default: return 'sort_disabled';
        }
    };
    Column.prototype.getSortIcon = function() {
        var state = this.state();

        switch (state) {
            case 'idle': return 'fa-sort';
            case 'Ascending': return 'fa-sort-up';
            case 'Descending': return 'fa-sort-down';
            case 'disabled': return '';
            case 'invisible': return ''; // for conor's hack.
            default: return '';
        }
    };
    var Page = function(data) {
        this.value = data.value;
        this.isDisabled = data.isDisabled;
        this.isActive = data.isActive;
        this.title = data.title;
        this.type = data.type; // arrow || number
    };

    // paging is like the controller.
    var isLoading = ko.observable(true);
    var initialized = false;
    var type = ko.observable('client'); // 'client' or 'server'
    var recordType = null;
    var advancedSearchInstance = null;


    var allRecords = records; // points to parent viewmodels master list
    //allRecords(records);

    var resultSet = ko.observableArray([]);                                  // filtered, or all :: is only added, or removed from by filter fn's, and display object
    var recordsToDisplay = ko.observableArray([]); // currently visible, paging :: is only added, or removed from by paging fn's

    var columns = ko.observableArray([]);
    var columnDefaultSort = ko.observable(null);
    columnDefaultSort.defaultSortDirection = null;

    var searchableFieldHash = {};

    var refreshResultSet = function() {
        // this fn is the one channel to show all records, and
        // eliminates records that are disabled from the result set.
        resultSet.removeAll();

        var underlying = resultSet();
        var all = allRecords();

        resultSet.valueWillMutate();
        for (var i = 0, len = all.length; i < len; i++) {
            var isDisabled = ko.unwrap(all[i].IS_DISABLED);

            if (isDisabled === false) {
                underlying.push(all[i]);
            }
        }

        resultSet.valueHasMutated();
    };

    var controller = function(action) {
        // user-requested: true, false,
        // action: 'reset', 'update', 
        var searchTerm = filtering.filter.peek();
        var isAdvancedSearch = advancedSearchInstance && advancedSearchInstance.isActive();

        switch (action) {
            // app defined
            case 'reset':
                refreshResultSet();
                sorting.defaultSort();
                paging.navigation.goToFirst();
                break;

            case 'reset:maintainSort':
                refreshResultSet();
                sorting.execute();
                paging.navigation.goToFirst();
                break;

            case 'update':
                refreshResultSet();

                if (isAdvancedSearch) {
                    advancedSearchInstance.send();
                } else {
                    filtering.filterRecords(searchTerm);
                }

                sorting.execute();
                paging.navigation.reload();
                break;

            // user defined
            case 'userRequest:filter':
                filtering.filterRecords(searchTerm);
                sorting.execute();
                paging.navigation.goToFirst();
                break;

            case 'userRequest:filterReset':
                filtering.filterRecords('');
                sorting.execute();
                paging.navigation.goToFirst();
                break;

            case 'userRequest:sort':
                sorting.execute();
                paging.navigation.goToFirst();
                break;

            // advanced filter
            case 'advancedFilter:filterReset':
                filtering.filter('');
                break;

            // no likey
            case 'advancedFilter:sort':
                sorting.execute();
                paging.navigation.goToFirst();
                break;

            // filter by criteria
            case 'filterByCriteria:execute':
                sorting.defaultSort();
                paging.navigation.goToFirst();
                break;

        }
    }

    function objectTraverser(path, obj) {
        // ex: path = 'lastRateWindow:NESTING1:PropIamLookingFor';
        //ex: record = {
        //	NAME: 'bob',
        //	amAnArray: [1,2,3,4,5],
        //	lastRateWindow: {
        //		AMOUNT: '200',
        //		NESTING1: {
        //			PropIamLookingFor: 'john',
        //			PropIamLookingForInArray: [{
        //				CHINGON: 'chinga te'
        //			}]
        //		}
        //	},
        //	NESTING2: {
        //		PropIamLookingFor: 'john',
        //		PropIamLookingForInArray: [{
        //			CHINGON: 'chinga te'
        //		}]
        //	}
        //}
        var nestedPropertyNames = path.split(':');
        var nestingLength = nestedPropertyNames.length;

        var value = ko.unwrap(obj[nestedPropertyNames[0]]); // set the first

        // start at 1, you already set the first
        for (var i = 1; i < nestingLength; i++) {
            // will be an object until it gets to the final value at end of path.
            if (JASON.utils.checkVariableType(value) === 'object') {
                // dont grab value of primitive, or null, or undefined.
                // the path is screwed up, there should always be an obj to get.
                value = ko.unwrap(value[nestedPropertyNames[i]]);
            }
        }

        return value;
    }

    var filtering = {
        isLoading: ko.observable(false),
        filter: ko.observable(''),
        isActive: ko.observable(true),
        clear: function() {
            filtering.filter('');
        },
        byCriteria: {
            isActive: ko.observable(false),
            filterRecords: function(key, values) {
                var valuesToFindHash = {};
                // {
                //            123: true,
                //            125: true
                //}

                for (var j = 0; j < values.length; j++) {
                    valuesToFindHash[('' + values[j]).toLowerCase()] = true;
                }

                var recordsToSearch = allRecords();
                var len = recordsToSearch.length;
                var output = [];

                for (var i = 0; i < len; i++) {
                    var record = recordsToSearch[i];
                    var recordValue = ko.unwrap(record[key]);
                    var sRecordValue = '';

                    if (recordValue === null || typeof recordValue === 'undefined' || recordValue === '') continue;

                    if (recordValue instanceof Array) {
                        for (var k = 0; k < recordValue.length; k++) {
                            sRecordValue = ('' + recordValue[k]).toLowerCase();
                            if (valuesToFindHash[sRecordValue]) {
                                output.push(record);
                            }
                        }
                    } else {
                        sRecordValue = ('' + recordValue).toLowerCase();
                        if (valuesToFindHash[sRecordValue]) {
                            output.push(record);
                        }
                    }
                }

                if (output.length) {
                    resultSet(output);
                    resultSet.valueHasMutated();

                    filtering.byCriteria.isActive(true);
                    return true;
                } else {
                    return false;
                }
            },
            filter: function(key, values) {
                var hasMatch = filtering.byCriteria.filterRecords(key, values);

                if (hasMatch === true) {
                    controller('filterByCriteria:execute');
                }
            },
            clear: function() {
                filtering.byCriteria.isActive(false);
                controller('reset');
            }
        },
        filterRecords: function(value) {
            var searchTerm = ('' + value).toLowerCase();
            var recordsToSearch = allRecords();
            var len = recordsToSearch.length;
            var output = [];
            var found = false;

            for (var i = 0; i < len; i++) {
                var record = recordsToSearch[i];

                // IS_DISABLED records are only viewable through AdvancedSearch API
                if (ko.unwrap(record.IS_DISABLED) === true) continue;

                // put in check for searchable properties
                for (var prop in searchableFieldHash) {

                    if (searchableFieldHash[prop] !== true) continue;

                    var recordValue = ko.unwrap(record[prop]);

                    // is an array? how do we want to handle arrays.

                    // is searchableFieldHash property a nested path?
                    if (prop.indexOf(':') !== -1) {
                        // this is a nested property path; need to traverse it to get to the primitive value
                        // path will be : delimited
                        recordValue = objectTraverser(prop, record);
                    }


                    if (recordValue === null || typeof recordValue === 'undefined' || recordValue === '') continue;


                    var attributeAsString = ('' + recordValue).toLowerCase();

                    if (attributeAsString.indexOf(searchTerm) !== -1) {
                        found = true;
                        break;
                    }
                }

                if (found) {
                    output.push(record);
                    found = false;
                    continue;
                }
            }

            resultSet(output);
            resultSet.valueHasMutated();
        },
        isResultsTextVisible: ko.pureComputed(function() {
            return filtering.filter() || filtering.byCriteria.isActive() || (advancedSearchInstance && advancedSearchInstance.isActive());
        })
    };
    filtering.filter.subscribe(function(value) {
        // ?? value.trim();
        if (value === '') {
            controller('userRequest:filterReset');
        } else {
            controller('userRequest:filter');
        }
    });

    //visible: (!advancedFilter.isActive() && !advancedFilter.isMaximized()) && recordsToDisplay().length > 0 || filter

    var sorting = {
        isLoading: ko.observable(false),
        selected: ko.observable(null),
        toggleSortDirection: function(selected) {
            var headers = columns();

            // starts out as idle after that it toggles.
            for (var i = 0, len = headers.length; i < len; i++) {
                var currentIteration = headers[i];
                var state = ko.unwrap(currentIteration.state);

                if (selected === currentIteration) {
                    currentIteration.state(state === 'idle' ? 'Ascending' : state === 'Ascending' ? 'Descending' : 'Ascending');
                } else {
                    // leave 'disabled' as disabled, and toggle the rest back to idle
                    if (state !== 'disabled') {
                        currentIteration.state('idle');
                    }
                }

            }
        },
        execute: function() {
            var item = sorting.selected();
            var fn = item.sortFn
            var state = ko.unwrap(item.state);

            if (typeof fn === 'function') {
                resultSet.sort(fn);
            } else {
                var key = item.key;
                resultSet.sort(function(a, b) {

                    a = ko.unwrap(a[key]),
                        b = ko.unwrap(b[key]);

                    if (typeof a === 'string') a = a.toLowerCase();
                    if (typeof b === 'string') b = b.toLowerCase();

                    return a === b ? 0 : a < b ? -1 : 1;
                });
            }

            if (state === 'Descending') {
                // .reverse is memmory hog.
                resultSet.reverse();
            }
        },
        // actions
        sort: function(item) {
            if (!item.canSort) return;

            sorting.toggleSortDirection(item);
            sorting.selected(item);

            controller('userRequest:sort');
        },
        defaultSort: function() {
            var defaultSortColumn = columnDefaultSort();

            defaultSortColumn.state(columnDefaultSort.defaultSortDirection);

            sorting.selected(defaultSortColumn);

            sorting.execute();
        }

    };

    // !! note paging may need to be built around the record count rather than the paging state?
    var paging = {
        currentPage: 1,
        lengthOptions: ko.observableArray([]),
        selectedPageLength: ko.observable(0),
        getMaxPage: function() { return Math.ceil(resultSet().length / this.selectedPageLength()); },
        recordCount: {
            displayedStart: ko.observable(0),
            displayedEnd: ko.observable(0),
            totalRecords: ko.observable(0),
            update: function() {
                var current = paging.currentPage;
                var pageLength = paging.selectedPageLength.peek();
                var total = resultSet().length;
                var end = (current * pageLength) > total ? total : (current * pageLength);


                this.displayedStart((current * pageLength) - (pageLength - 1));
                this.displayedEnd(end);
                this.totalRecords(total);
            }
        },
        navigation: {
            pages: ko.observableArray([]),

            goToFirst: function() {
                paging.navigation.select({ value: 1 });
            },
            goToLast: function() {
                paging.navigation.select({ value: paging.getMaxPage() });
            },
            reload: function() {
                paging.navigation.select({ value: paging.currentPage });
            },
            select: function(page) {
                if (page.isDisabled) return;

                paging.currentPage = page.value || 1;

                paging.navigation.fire();

                if (page instanceof Page) ko.postbox.publish('jason-table-navigation-occurred');
            },

            build: function() {
                paging.navigation.pages([]);

                var totalPages = paging.getMaxPage();
                var startingPoint = 1;
                var endingPoint = totalPages;
                var currentPage = paging.currentPage;
                var range = 7;

                if (totalPages <= range) {
                    startingPoint = 1;
                    endingPoint = totalPages + 1;
                } else {

                    if (currentPage > 0 && currentPage < range) {
                        // at beginning
                        startingPoint = 1;
                        endingPoint = range + 1;
                    } else if (currentPage > ((totalPages - range) + 1)) {
                        // at end
                        startingPoint = (totalPages - range) + 1;
                        endingPoint = totalPages + 1;
                    } else {
                        // in middle
                        startingPoint = Math.ceil(currentPage - (range / 2));
                        endingPoint = Math.floor(currentPage + (range / 2)) + 1;
                    }
                }


                paging.navigation.pages.push(new Page({
                    value: 1,
                    isDisabled: (currentPage === 1),
                    isActive: false,
                    title: '<i class="fa fa-step-backward"></i>',
                    type: 'arrow'
                }));
                paging.navigation.pages.push(new Page({
                    value: currentPage - 1,
                    isDisabled: (currentPage === 1),
                    isActive: false,
                    title: '<i class="fa fa-chevron-left"></i>',
                    type: 'arrow'
                }));

                for (var i = startingPoint; i < endingPoint; i++) {
                    paging.navigation.pages.push(new Page({
                        value: i,
                        isDisabled: i === currentPage,
                        isActive: i === currentPage,
                        title: i,
                        type: 'number'
                    }));
                }

                paging.navigation.pages.push(new Page({
                    value: currentPage + 1,
                    isDisabled: (currentPage === totalPages),
                    isActive: false,
                    title: '<i class="fa fa-chevron-right"></i>',
                    type: 'arrow'
                }));
                paging.navigation.pages.push(new Page({
                    value: totalPages,
                    isDisabled: (currentPage === totalPages),
                    isActive: false,
                    title: '<i class="fa fa-step-forward"></i>',
                    type: 'arrow'
                }));
            },
            fire: function() {
                // this does not take into account records that are removed,
                // state is screwed up if records are removed
                // needs a re-think to be fair.

                var selectedPageLength = paging.selectedPageLength();
                var index = (paging.currentPage - 1) * selectedPageLength;
                var resultSetLength = resultSet().length;
                var min = index;
                var max = index + selectedPageLength

                if (resultSetLength !== 0 && resultSetLength <= index) {
                    // we have deleted a record from the result set and now this is screwed up,
                    // may be a sign of a bigger design flaw?
                    JASON.core.log('log', 'is this a problem?');
                    min = index - selectedPageLength;
                    max = index;

                    // bring her back a page.
                    paging.navigation.select({ value: paging.currentPage - 1 })
                }

                var output = resultSet.slice(min, max);

                recordsToDisplay(output);

                paging.navigation.build();
                paging.recordCount.update();
            }
        }
    };
    paging.selectedPageLength.subscribe(function(value) {
        if (!initialized) return;
        paging.navigation.goToFirst();
    });



    var update = function(mandates) {
        isLoading(true);

        if (mandates && mandates.maintainState === true) {
            controller('update');
        } else {
            controller('reset');
        }

        //if (filtering.byCriteria.isActive() === true) {
        //            filtering.byCriteria.clear(); // !! MAKE SURE THIS IS NOT A PROBLEM HERE.
        //}

        isLoading(false);
    };


    var bindingAttributes = {
        loader: {
            css: '',
            visible: '',
            attr: ''
        }
    }





    var initialize = function() {
        options = options || {};

        paging.lengthOptions = options.pageSizeOptions || [5, 10, 15, 20, 25];
        paging.selectedPageLength(options.selectedPageLength || 10);
        recordType = options.recordType || 'Record';

        for (var i = 0, len = options.headers.length; i < len; i++) {
            var header = options.headers[i];
            header.state = !header.canSort ? 'disabled' : 'idle';

            columns.push(new Column(header));
            searchableFieldHash[header.key] = header.canSearch;
        }

        if (options.searchableAttributes.length) {
            for (var i = 0; i < options.searchableAttributes.length; i++) {
                searchableFieldHash[options.searchableAttributes[i]] = true;
            }
        }

        //if (options.advancedFilter === true) {
        //	// not sure I like this approach or use pub/sub
        //	advancedSearchInstance = new JASON.apis.AdvancedFilter({
        //		allRecords: allRecords,
        //		resultSet: resultSet,
        //		controller: controller
        //	});
        //}

        if (JASON.utils.checkVariableType(options.advancedFilter) === 'object') {
            // not sure I like this approach or use pub/sub
            advancedSearchInstance = new JASON.apis.AdvancedFilter({
                allRecords: allRecords,
                resultSet: resultSet,
                controller: controller
            });

            advancedSearchInstance.initialize({ fields: options.advancedFilter.config, owner: options.owner })
        }

        if (options.defaultSort) {
            var column = columns()[options.defaultSort.index];

            column.state(options.defaultSort.direction);
            columnDefaultSort(column);
            columnDefaultSort.defaultSortDirection = options.defaultSort.direction;
            sorting.selected(column)

        } else {
            var column = columns()[0];

            column.state('Descending');
            columnDefaultSort(column);
            columnDefaultSort.defaultSortDirection = 'Descending'
            sorting.selected(column)
        }

        ko.postbox.subscribe('update-jason-tables', function() { controller('update') });
        ko.postbox.subscribe('reset-jason-tables', function() { controller('reset') });
        ko.postbox.subscribe('update-jason-tables-advancedFilter', function() { controller('advancedFilter:update') });

        initialized = true;
    } ();

    var destroy = function() {
        filtering.clear();
        filtering.byCriteria.isActive(false);
        recordsToDisplay.removeAll();
        resultSet.removeAll();
        // allRecords([]); // this will wipe out reference
        isLoading(true);
    };

    return {
        dataSource: type,
        headers: columns,
        filter: filtering.filter,
        criteriaFilter: filtering.byCriteria.filter,
        isCriteriaFilterActive: filtering.byCriteria.isActive,
        isFilterResultsVisible: filtering.isResultsTextVisible,
        clearCriteria: filtering.byCriteria.clear,
        clearFilter: filtering.clear,
        sort: sorting.sort,
        recordsToDisplay: recordsToDisplay,
        allRecords: allRecords,
        pages: paging.navigation.pages,
        selectPage: paging.navigation.select,
        pageLengths: paging.lengthOptions,
        selectedPageLength: paging.selectedPageLength,
        isLoading: isLoading,
        recordCount: paging.recordCount,
        update: update,
        destroy: destroy,
        recordType: recordType,
        advancedFilter: advancedSearchInstance,
        bindingAttributes: bindingAttributes
    }
};

// 11,000 > 410