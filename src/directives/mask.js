(function() {
  'use strict';
  angular.module('ngMask')
    .directive('mask', ['$log', '$timeout', 'MaskService', 'ngMaskConfig', function($log, $timeout, MaskService, ngMaskConfig) {
      return {
        restrict: 'A',
        require: 'ngModel',
        compile: function($element, $attrs) { 
         if (!$attrs.mask || !$attrs.ngModel) {
            $log.info('Mask and ng-model attributes are required!');
            return;
          }

		  var _mask = $attrs.mask;
      var _validate;

      // Set Alias and function
		  if (typeof ngMaskConfig.alias[_mask] != 'undefined') {
          $attrs.mask = ngMaskConfig.alias[_mask];
      
        _validate = $attrs.mask.validate;
      
        if (typeof $attrs.mask == 'object') {
          $attrs.mask = $attrs.mask.mask;
        }
      
        if (typeof $attrs.mask == 'function') {
          $attrs.mask = $attrs.mask($attrs);
        }
      }


          var maskService = MaskService.create();
          var timeout;
          var promise;

          function setSelectionRange(selectionStart){
            if (typeof selectionStart !== 'number') {
              return;
            }

            // using $timeout:
            // it should run after the DOM has been manipulated by Angular
            // and after the browser renders (which may cause flicker in some cases)
            $timeout.cancel(timeout);
            timeout = $timeout(function(){
              var selectionEnd = selectionStart + 1;
              var input = $element[0];

              if (input.setSelectionRange) {
                input.focus();
                input.setSelectionRange(selectionStart, selectionEnd);
              } else if (input.createTextRange) {
                var range = input.createTextRange();

                range.collapse(true);
                range.moveEnd('character', selectionEnd);
                range.moveStart('character', selectionStart);
                range.select();
              }
            });
          }

          return {
            pre: function($scope, $element, $attrs, controller) {
              promise = maskService.generateRegex({
                mask: $attrs.mask,
                // repeat mask expression n times
                repeat: ($attrs.repeat || $attrs.maskRepeat),
                // clean model value - without divisors
                clean: (($attrs.clean || $attrs.maskClean) === 'true'),
                // limit length based on mask length
                limit: (($attrs.limit || $attrs.maskLimit || 'true') === 'true'),
                // how to act with a wrong value
                restrict: ($attrs.restrict || $attrs.maskRestrict || 'reject'), //select, reject, accept
                // set validity mask
                validate: (($attrs.validate || $attrs.maskValidate || 'true') === 'true'),
                // default model value
                model: $attrs.ngModel,
                // default input value
                value: $attrs.ngValue
              });
            },
            post: function($scope, $element, $attrs, controller) {
              promise.then(function() {
                // get initial options
                var timeout;
                var options = maskService.getOptions();

                function parseViewValue(value) {
                  // set default value equal 0
                  value = value || '';

				  // para o caso do datepicker onde value � um Date e n�o uma string
				  if (value instanceof Date) {
					  return value;
				  }
				  
                  // get view value object
                  var viewValue = maskService.getViewValue(value);

                  // get mask without question marks
                  var maskWithoutOptionals = options['maskWithoutOptionals'] || '';

                  // get view values capped
                  // used on view
                  var viewValueWithDivisors = viewValue.withDivisors(true);
                  // used on model
                  var viewValueWithoutDivisors = viewValue.withoutDivisors(true);

                  try {
                    // get current regex
                    var regex = maskService.getRegex(viewValueWithDivisors.length - 1);
                    var fullRegex = maskService.getRegex(maskWithoutOptionals.length - 1);

                    // current position is valid
                    var validCurrentPosition = regex.test(viewValueWithDivisors) || fullRegex.test(viewValueWithDivisors);

                    // difference means for select option
                    var diffValueAndViewValueLengthIsOne = (value.length - viewValueWithDivisors.length) === 1;
                    var diffMaskAndViewValueIsGreaterThanZero = (maskWithoutOptionals.length - viewValueWithDivisors.length) > 0;

                    if (options.restrict !== 'accept') {
                      if (options.restrict === 'select' && (!validCurrentPosition || diffValueAndViewValueLengthIsOne)) {
                        var lastCharInputed = value[(value.length-1)];
                        var lastCharGenerated = viewValueWithDivisors[(viewValueWithDivisors.length-1)];

                        if ((lastCharInputed !== lastCharGenerated) && diffMaskAndViewValueIsGreaterThanZero) {
                          viewValueWithDivisors = viewValueWithDivisors + lastCharInputed;
                        }

                        var wrongPosition = maskService.getFirstWrongPosition(viewValueWithDivisors);
                        if (angular.isDefined(wrongPosition)) {
                          setSelectionRange(wrongPosition);
                        }
                      } else if (options.restrict === 'reject' && !validCurrentPosition) {
                        viewValue = maskService.removeWrongPositions(viewValueWithDivisors);
                        viewValueWithDivisors = viewValue.withDivisors(true);
                        viewValueWithoutDivisors = viewValue.withoutDivisors(true);

                        // setSelectionRange(viewValueWithDivisors.length);
                      }
                    }

                    if (!options.limit) {
                      viewValueWithDivisors = viewValue.withDivisors(false);
                      viewValueWithoutDivisors = viewValue.withoutDivisors(false);
                    }

                    // Set validity
                    if (options.validate && controller.$dirty) {
                        if (fullRegex.test(viewValueWithDivisors) || controller.$isEmpty(controller.$modelValue)) {
                            controller.$setValidity('mask', !_validate || _validate(viewValueWithoutDivisors));
                        } else {
                            controller.$setValidity('mask', false);
                        }
                    }

                    // Update view and model values
                    if(value !== viewValueWithDivisors){
                      controller.$setViewValue(angular.copy(viewValueWithDivisors), 'input');
                      controller.$render();
                    }
                  } catch (e) {
                    $log.error('[mask - parseViewValue]');
                    throw e;
                  }

                  // Update model, can be different of view value
                  if (options.clean) {
                    return viewValueWithoutDivisors;
                  } else {
                    return viewValueWithDivisors;
                  }
                }

                controller.$parsers.push(parseViewValue);

                $element.on('click input paste keyup', function() {
                  timeout = $timeout(function() {
                    // Manual debounce to prevent multiple execution
                    $timeout.cancel(timeout);

                    parseViewValue($element.val());
                    $scope.$apply();
                  }, 100);
                });

                // Register the watch to observe remote loading or promised data
                // Deregister calling returned function
                var watcher = $scope.$watch($attrs.ngModel, function (newValue, oldValue) {
                  if (angular.isDefined(newValue)) {
                    parseViewValue(newValue);
                    watcher();
                  }
                });

                // $evalAsync from a directive
                // it should run after the DOM has been manipulated by Angular
                // but before the browser renders
                if(options.value) {
                  $scope.$evalAsync(function($scope) {
                    controller.$setViewValue(angular.copy(options.value), 'input');
                    controller.$render();
                  });
                }
              });
            }
          }
        }
      }
    }]);
})();