RdioAlbum = Backbone.Model.extend({});

TrackSentiment = Backbone.Model.extend({
});

TrackSentimentCollection = Backbone.Collection.extend({
    model: TrackSentiment,
    comparator: function(trackSentiment) {
        postiveCount = trackSentiment.get('sentiment').positive;
        if (_.isUndefined(postiveCount)) {
            return 0;
        } else {
            return -postiveCount;
        }
    }
});

AlbumSentiment = Backbone.Model.extend({
    initialize: function(props) {
        this.albumKey = props.albumKey;
        this.trackSentimentCollection = new TrackSentimentCollection;
    },

    url: function() {
        return "/alchemyapi/album/" + this.albumKey + "/";
    },

    parse: function(response) {
        this.album = new RdioAlbum(response.item)
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
        this.trackSentimentListView = new TrackSentimentListView({
            model: this.model.trackSentimentCollection
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

        return this;
    }
});

TrackSentimentItemView = Backbone.View.extend({
    tagName: "tr",

    template: _.template($('#track-sentiment-item').html()),

    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        return this;
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
                model: trackSentiment
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

albumSentimentModel.fetch();
