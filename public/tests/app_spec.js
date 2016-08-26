describe('LearnJS', function() {
	beforeEach(function() {
		learnjs.identity = new $.Deferred();
	});

	it('can show a problem view', function() {
		learnjs.showView('#problem-1');
		expect($('.view-container .problem-view').length).toEqual(1);
	});

	it('shows the landing page view when there is no hash', function() {
		learnjs.showView('');
		expect($('.view-container .landing-view').length).toEqual(1);
	});

	it('passes the hash view parameter to the view function', function() {
		spyOn(learnjs, 'problemView');
		learnjs.showView('#problem-42');
		expect(learnjs.problemView).toHaveBeenCalledWith('42');
	});

	it ('triggers removingView event when removing the view', function() {
		spyOn(learnjs, 'triggerEvent');
		learnjs.showView('#problem-1');
		expect(learnjs.triggerEvent).toHaveBeenCalledWith('removingView', []);
	});

	it('invokes the router when loaded', function() {
		spyOn(learnjs, 'showView');
		learnjs.appOnReady();
		expect(learnjs.showView).toHaveBeenCalledWith(window.location.hash);
	});

	it('subscribes to the hash change event', function() {
		learnjs.appOnReady();
		spyOn(learnjs, 'showView');
		$(window).trigger('hashchange');
		expect(learnjs.showView).toHaveBeenCalledWith(window.location.hash);
	});

	it('can flash an element while setting the text', function() {
		var elem = $('<p>');
		spyOn(elem, 'fadeOut').and.callThrough();
		spyOn(elem, 'fadeIn');
		learnjs.flashElement(elem, "new text");
		expect(elem.text()).toEqual('new text');
		expect(elem.fadeOut).toHaveBeenCalled();
		expect(elem.fadeIn).toHaveBeenCalled();
	});

	it('can redirect to the main view after the last problem is answered', function() {
		var flash = learnjs.buildCorrectFlash(2);
		expect(flash.find('a').attr('href')).toEqual("");
		expect(flash.find('a').text()).toEqual("You're finished!");
	});

	it('can trigger events on the view', function() {
		callback = jasmine.createSpy('callback');
		var div = $('<div>').bind('fooEvent', callback);
		$('.view-container').append(div);
		learnjs.triggerEvent('fooEvent', ['bar']);
		expect(callback).toHaveBeenCalled();
		expect(callback.calls.argsFor(0)[1]).toEqual('bar');
	});

	it('adds the profile link when the user logs in', function() {
		profile = {email: 'foo@bar.com'};
		spyOn(learnjs, 'addProfileLink');
		learnjs.appOnReady();
		learnjs.identity.resolve(profile);
		expect(learnjs.addProfileLink).toHaveBeenCalledWith(profile);
	});

	it('can append a profile link to the navbar', function() {
		learnjs.addProfileLink({email: 'foo@bar.com'});
		expect($('.signin-bar a').html()).toEqual('foo@bar.com');
		expect($('.signin-bar a').attr('href')).toEqual('#profile');
	});

	describe('saveAnswer', function() {
		var dbspy, req, identityObj;
		beforeEach(function() {
			dbspy = jasmine.createSpyObj('db', ['put']);
			dbspy.put.and.returnValue('request');
			spyOn(AWS.DynamoDB,'DocumentClient').and.returnValue(dbspy);
			spyOn(learnjs, 'sendDbRequest');
			identityObj = {id: 'COGNITO_ID'};
			learnjs.identity.resolve(identityObj);
		});

		it('writes the item to the database', function() {
			learnjs.saveAnswer(1, {});
			expect(learnjs.sendDbRequest).toHaveBeenCalledWith('request', jasmine.any(Function));
			expect(dbspy.put).toHaveBeenCalledWith({
				TableName: 'learnjs',
				Item: {
					userId: 'COGNITO_ID',
					problemId: 1,
					answer: {}
				}
			});
		});

		it('resubmits the request on retry', function() {
			learnjs.saveAnswer(1, {answer: 'false'});
			spyOn(learnjs, 'saveAnswer').and.returnValue('promise');
			expect(learnjs.sendDbRequest.calls.first().args[1]()).toEqual('promise');
			expect(learnjs.saveAnswer).toHaveBeenCalledWith(1, {answer: 'false'});
		});
	});

	describe('sendDbRequest', function() {
		var request, requestHandlers, promise, retrySpy;
		beforeEach(function() {
			requestHandlers = {};
			request = jasmine.createSpyObj('request', ['send', 'on']);
			request.on.and.callFake(function(eventName, callback) {
				requestHandlers[eventName] = callback;
			});
			retrySpy = jasmine.createSpy('retry');
			promise = learnjs.sendDbRequest(request, retrySpy);
		});

		it('resolves the returned promise on success', function(done) { 
			requestHandlers.success({data: 'data'}); 
			expect(request.send).toHaveBeenCalled(); 
			promise.then(function(data) { 
				expect(data).toEqual('data'); 
				done(); 
			}, fail); 
		});

		it('rejects the returned promise on error', function(done) {
			learnjs.identity.resolve({refresh: function() { return new $.Deferred().reject()}});
			requestHandlers.error({code: "SomeError"});
			promise.fail(function(resp) {
				expect(resp).toEqual({code: "SomeError"});
				done();
			});
		});

		it('refreshes the credentials and retries when the credentials are expired', function() {
			learnjs.identity.resolve({refresh: function() { return new $.Deferred().resolve()}});
			requestHandlers.error({code: "CredentialsError"});
			expect(retrySpy).toHaveBeenCalled(); 
		});
	});

	describe('problem view', function() {
        var view;
        beforeEach(function() {
			view = learnjs.problemView('1');
        });

		it('has a title that includes the problem number', function() {
			expect(view.find('.title').text()).toEqual('Problem #1');
		});

        it('shows the description', function() {
            expect(view.find('[data-name="description"]').text()).toEqual('What is truth?');
        });

        it('shows the problem code', function() {
            expect(view.find('[data-name="code"]').text()).toEqual('function problem() { return __; }');
        });

		describe('skip button', function() {
			it('is added to the navbar when the view is added', function() {
				expect($('.nav-list .skip-btn').length).toEqual(1);
			});

			it('is removed to the navbar when the view is removed', function() {
				view.trigger('removingView', []);
				expect($('.nav-list .skip-btn').length).toEqual(0);
			});

			it('contains a link to the next problem', function() {
				expect($('.nav-list .skip-btn a').attr('href')).toEqual('#problem-2');
			});

			it('is not added when at the last problem', function() {
				view.trigger('removingView');
				view = learnjs.problemView('2');
				expect($('.nav-list .skip-btn').length).toEqual(0);
			});
		});

        describe('answer section', function() {
			var resultFlash;

			beforeEach(function() {
				spyOn(learnjs, 'flashElement');
				resultFlash = view.find('.result');
			});

			describe('when the answer is correct', function() {
				beforeEach(function() {
					view.find('.answer').val('true');
					view.find('.check-btn').click();
				});

				it('flashes the result', function() {
					var flashArgs = learnjs.flashElement.calls.argsFor(0);
					expect(flashArgs[0]).toEqual(resultFlash);
					expect(flashArgs[1].find('span').text()).toEqual('Correct!');
				});

				it('shows a link to the next problem', function() {
					var link = learnjs.flashElement.calls.argsFor(0)[1].find('a');
					expect(link.text()).toEqual('Next Problem');
					expect(link.attr('href')).toEqual('#problem-2');
				});
			});

            it('rejects an incorrect answer', function() {
                view.find('.answer').val('false');
                view.find('.check-btn').click();
                expect(learnjs.flashElement).toHaveBeenCalledWith(resultFlash, 'Incorrect!');
            });
        });
	});
});
