var JASON = JASON || {};
JASON.apis = JASON.apis || {};

JASON.apis.AdvancedFilter = function (options) {

	var self = this;

	self.fields = [];
	self.isActive = ko.observable(false);
	self.canClear = ko.observable(false);
	self.isMaximized = ko.observable(false);
	self.owner = null;

	self.exteriorFields = [];

	var filter = function () {
		var searchTermsLength = 0;
		var valuesToFindHash = {};

		var k = self.fields.length;
		while(k--) {
			var field = self.fields[k];
			var value = field.value;

			if (ko.unwrap(value) || field.control.type === 'checkbox') {
				valuesToFindHash[field.propertyName] = field;
				searchTermsLength++
			}
		}

		var recordsToSearch = options.allRecords();

		options.resultSet.removeAll();
		var underlying = options.resultSet();


		for (var i = 0, len = recordsToSearch.length; i < len; i++) {
			var record = recordsToSearch[i];
			var matches = [];

			for (var prop in valuesToFindHash) {
				var recordValue = ko.unwrap(record[prop]);
				var filterField = valuesToFindHash[prop];
				var sValue = String(recordValue).toLowerCase();
				var sSearchTerm = String(ko.unwrap(filterField.value)).toLowerCase();
				
				if (filterField.control.type === 'checkbox') {
					if (sSearchTerm === 'true' && filterField.control.onConditionTrue(recordValue)) {
						matches.push(true);
						continue;
					} 

					if (sSearchTerm === 'false' && filterField.control.onConditionFalse(recordValue)) {
						matches.push(true);
						continue;
					} 
				}

				// !! dont need a select if statement because I set the value of the option to the name of the option. briliant.
			
				// !! THE CHECK FOR FALSY VALUES HERE, CAN CIRCUMVENT FILTERING, IE: CHECKBOXES.
				if (recordValue === null || typeof recordValue === 'undefined' || recordValue === '') continue;

				if (sValue.indexOf(sSearchTerm) !== -1) {
					matches.push(true);
					continue;
				}
			}

			// if the amount of matches, is equal to the number of searched fields,
			// then all conditions have been satisfied
			// note: this will also be true if matches.length = 0 && searchTermsLength = 0
			// if there are no search terms then it will put all records in the result set
			if (matches.length === searchTermsLength) {
				underlying.push(record);
			}
		}

		self.isActive(true);
		//console.log(self.owner)
		//self.isMaximized(false);	
	};

	var hide = function (e) {
		self.isMaximized(false);
	};

	self.send = function () {
		// i dont like this.
		options.controller('advancedFilter:filterReset');

		filter();

		// i dont like this.
		options.controller('advancedFilter:sort');
	};

	self.clear = function () {
		ko.utils.arrayForEach(self.fields, function (field) {
			field.value(field.control.type === 'checkbox' ? false : null);
		})

		ko.postbox.publish('reset-jason-tables');

		self.isActive(false);
	};

	self.cancel = function (o) {
		self.isMaximized(false);
		self.clear();
	};

	self.toggle = function () {
		self.isMaximized(!self.isMaximized());
	};

	self.initialize = function (options) {
		var i = options.fields.length;

		while(i--) {
			var field = options.fields[i];
			field.value.subscribe(self.send);
			if (field.exterior = true) self.exteriorFields.push(field)
		}
		self.fields = options.fields;
		self.owner = options.owner; // for debugging
	};
};