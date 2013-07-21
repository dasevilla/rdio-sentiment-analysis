RdioAlbum = Backbone.Model.extend({
    sync: function(method, model, options) {
        var self = this;
        R.request({
          method: "get",
          content: {
            keys: this.get('key'),
            extras: "tracks,bigIcon"
          },
          success: function(response) {
            options.success(response.result[self.get('key')])
          },
          error: function(response) {
            console.log("error: ", response.message);
          }
        });
    }
});

TrackSentiment = Backbone.Model.extend({
});

TrackSentimentCollection = Backbone.Collection.extend({
    model: TrackSentiment,
    comparator: function(trackSentiment) {
        postiveCount = trackSentiment.get('sentiment').positive;
        neutrualCount = trackSentiment.get('sentiment').neutrual;
        negativeCount = trackSentiment.get('sentiment').negative;

        if (_.isUndefined(postiveCount)) {
            postiveCount = 0;
        }
        if (_.isUndefined(neutrualCount)) {
            neutrualCount = 0;
        }
        if (_.isUndefined(negativeCount)) {
            negativeCount = 0;
        }

        return negativeCount - postiveCount
    }
});

AlbumSentiment = Backbone.Model.extend({
    initialize: function(props) {
        this.albumKey = props.albumKey;
        this.album = new RdioAlbum;
        this.trackSentimentCollection = new TrackSentimentCollection;
    },

    url: function() {
        return "/alchemyapi/album/" + this.albumKey + "/";
    },

    parse: function(response) {
        this.album = new RdioAlbum(response.item)
        this.album.fetch();
        items = _.map(response.per_item_sentiment, function(sentiment, key) {
            return {
                "trackKey": key,
                "sentiment": sentiment
            };
        })
        items = _.filter(items, function(item) {
            if (item['trackKey'][0] == 't') {
                return true;
            } else {
                return false;
            }
        });
        this.trackSentimentCollection.reset(items);
        return response;
    }
});

RdioAlbumView = Backbone.View.extend({
    template: _.template($('#rdio-album').html()),

    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        return this;
    }
});

AlbumSentimentView = Backbone.View.extend({
    sentimentTemplate: _.template($('#sentiment-icons').html()),

    initialize: function() {
        var self = this;
        this.model.bind("change", this.render, this);
        this.model.album.bind("change", this.render, this);
        this.trackSentimentListView = new TrackSentimentListView({
            model: this.model.trackSentimentCollection,
            album: this.model.album
        });
    },

    render: function() {
        this.$el.empty();

        renderedAlbumView = new RdioAlbumView({
            model: this.model.album
        }).render();

        renderedAlbumView.$el.find('.album-sentiment')
            .replaceWith(this.sentimentTemplate(this.model.get('total_sentiment')));

        this.$el.append(renderedAlbumView.el);

        this.$el.find('#the-tracks').append(this.trackSentimentListView.render().el);
        var player = new metronomik.player("rdio-player", R.player);

        return this;
    }
});

TrackSentimentItemView = Backbone.View.extend({
    tagName: "tr",

    events: {
        "click .rdio-play-btn": "playTrack"
    },

    template: _.template($('#track-sentiment-item').html()),

    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        return this;
    },

    playTrack: function() {
        R.player.play({
            source: this.model.get('trackKey')
        });
    }
});

TrackSentimentListView = Backbone.View.extend({
    tagName: 'table',
    className: 'table',
    template: _.template($('#track-sentiment-table').html()),

    initialize: function() {
        var self = this;
        this.model.bind("reset", this.render, this);
        this.model.bind("add", function(trackSentiment) {
            self.$el.append(new TrackSentimentItemView({
                model: trackSentiment,
            }).render().el);
        })
    },

    render: function() {
        this.$el.empty();

        this.$el.html(this.template(this.model.toJSON()));

        tableBody = this.$el.find(".track-sentiment-table-body");
        _.each(this.model.models, function(trackSentiment) {
            tableBody.append(new TrackSentimentItemView({
                model: trackSentiment
            }).render().el);
        }, this);

        return this;
    }
});

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

key = getParameterByName('key');
if (_.isNull(key)) {
    key = "a3122373";
}
albumSentimentModel = new AlbumSentiment({
    albumKey: key
});

albumSentimentView = new AlbumSentimentView({
  el: $("#the-album"),
  model: albumSentimentModel
});

R.ready(function() {
    albumSentimentModel.fetch();

});
